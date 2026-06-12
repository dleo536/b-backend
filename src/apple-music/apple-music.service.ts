import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPrivateKey, sign } from 'crypto';

type AppleMusicResponseCacheEntry = {
  expiresAt: number;
  value: unknown;
};

@Injectable()
export class AppleMusicService {
  private readonly logger = new Logger(AppleMusicService.name);
  private readonly apiBaseUrl = 'https://api.music.apple.com/v1';
  private readonly maxSearchLimit = 25;
  private readonly maxQueryLength = 120;
  private readonly developerTokenTtlSeconds = 30 * 24 * 60 * 60;
  private readonly responseCacheTtlMs = 5 * 60 * 1000;
  private readonly responseCacheMaxEntries = 250;
  private cachedDeveloperToken: string | null = null;
  private developerTokenExpiresAt = 0;
  private readonly responseCache = new Map<string, AppleMusicResponseCacheEntry>();
  private readonly inFlightRequests = new Map<string, Promise<unknown>>();

  private getCredentials() {
    const teamId = process.env.APPLE_MUSIC_TEAM_ID?.trim();
    const keyId = process.env.APPLE_MUSIC_KEY_ID?.trim();
    const privateKey = this.normalizePrivateKey(
      process.env.APPLE_MUSIC_PRIVATE_KEY,
    );

    if (!teamId || !keyId || !privateKey) {
      throw new ServiceUnavailableException(
        'Apple Music credentials are not configured',
      );
    }

    return { teamId, keyId, privateKey };
  }

  private normalizePrivateKey(value?: string): string | null {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      return null;
    }

    return normalizedValue.replace(/\\n/g, '\n');
  }

  private base64UrlJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private derSignatureToJose(derSignature: Buffer): Buffer {
    let offset = 0;

    if (derSignature[offset++] !== 0x30) {
      throw new Error('Invalid ECDSA signature sequence');
    }

    const sequenceLength = derSignature[offset++];
    if (sequenceLength + offset !== derSignature.length) {
      throw new Error('Invalid ECDSA signature length');
    }

    const readInteger = () => {
      if (derSignature[offset++] !== 0x02) {
        throw new Error('Invalid ECDSA signature integer');
      }

      const length = derSignature[offset++];
      const value = derSignature.subarray(offset, offset + length);
      offset += length;

      return value;
    };

    const normalizeInteger = (value: Buffer) => {
      let normalized = value;
      while (normalized.length > 32 && normalized[0] === 0) {
        normalized = normalized.subarray(1);
      }

      if (normalized.length > 32) {
        throw new Error('Invalid ECDSA signature integer length');
      }

      return Buffer.concat([Buffer.alloc(32 - normalized.length), normalized]);
    };

    return Buffer.concat([
      normalizeInteger(readInteger()),
      normalizeInteger(readInteger()),
    ]);
  }

  private createDeveloperToken(): string {
    const { teamId, keyId, privateKey } = this.getCredentials();
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'ES256',
      kid: keyId,
      typ: 'JWT',
    };
    const payload = {
      iss: teamId,
      iat: now,
      exp: now + this.developerTokenTtlSeconds,
    };
    const signingInput = `${this.base64UrlJson(header)}.${this.base64UrlJson(
      payload,
    )}`;
    let joseSignature: Buffer;

    try {
      const derSignature = sign(
        'sha256',
        Buffer.from(signingInput),
        createPrivateKey(privateKey),
      );
      joseSignature = this.derSignatureToJose(derSignature);
    } catch (error) {
      this.logger.error('Apple Music developer token signing failed');
      throw new ServiceUnavailableException(
        'Apple Music credentials are invalid',
      );
    }

    this.cachedDeveloperToken = `${signingInput}.${joseSignature.toString(
      'base64url',
    )}`;
    this.developerTokenExpiresAt = (payload.exp - 60) * 1000;

    return this.cachedDeveloperToken;
  }

  private getDeveloperToken(): string {
    if (
      this.cachedDeveloperToken &&
      Date.now() < this.developerTokenExpiresAt
    ) {
      return this.cachedDeveloperToken;
    }

    return this.createDeveloperToken();
  }

  private normalizeSearchQuery(query: string): string {
    const normalizedQuery = query?.trim();

    if (!normalizedQuery) {
      throw new BadRequestException('q is required');
    }

    return normalizedQuery.slice(0, this.maxQueryLength);
  }

  private normalizeLimit(limit = 10): number {
    if (!Number.isFinite(limit)) {
      return 10;
    }

    return Math.min(Math.max(Math.trunc(limit), 1), this.maxSearchLimit);
  }

  private normalizeOffset(offset = 0): number {
    if (!Number.isFinite(offset)) {
      return 0;
    }

    return Math.max(Math.trunc(offset), 0);
  }

  private normalizeStorefront(storefront?: string): string {
    const normalizedStorefront =
      storefront?.trim() || process.env.APPLE_MUSIC_STOREFRONT?.trim() || 'us';

    if (!/^[A-Za-z]{2}$/.test(normalizedStorefront)) {
      return 'us';
    }

    return normalizedStorefront.toLowerCase();
  }

  private buildApiUrl(
    pathname: string,
    query?: Record<string, string | number | undefined>,
  ) {
    const url = new URL(`${this.apiBaseUrl}${pathname}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    return url;
  }

  private getResponseCacheKey(
    pathname: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    return this.buildApiUrl(pathname, query).toString();
  }

  private getCachedResponse<T>(cacheKey: string): T | undefined {
    const now = Date.now();
    const cachedEntry = this.responseCache.get(cacheKey);

    if (!cachedEntry) {
      return undefined;
    }

    if (cachedEntry.expiresAt <= now) {
      this.responseCache.delete(cacheKey);
      return undefined;
    }

    return cachedEntry.value as T;
  }

  private setCachedResponse(cacheKey: string, value: unknown) {
    const now = Date.now();
    this.pruneExpiredResponseCache(now);

    if (this.responseCache.size >= this.responseCacheMaxEntries) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) {
        this.responseCache.delete(oldestKey);
      }
    }

    this.responseCache.set(cacheKey, {
      value,
      expiresAt: now + this.responseCacheTtlMs,
    });
  }

  private pruneExpiredResponseCache(now: number) {
    for (const [key, entry] of this.responseCache.entries()) {
      if (entry.expiresAt <= now) {
        this.responseCache.delete(key);
      }
    }
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new BadGatewayException('Apple Music returned an invalid response');
    }
  }

  private getAppleDiagnosticHeaders(response: Response) {
    const diagnosticHeaderNames = [
      'retry-after',
      'x-apple-request-id',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
    ];
    const headers: Record<string, string> = {};

    for (const headerName of diagnosticHeaderNames) {
      const value = response.headers.get(headerName);
      if (value) {
        headers[headerName] = value;
      }
    }

    return headers;
  }

  private formatDiagnosticHeaders(headers: Record<string, string>) {
    const entries = Object.entries(headers);
    if (entries.length === 0) {
      return 'none';
    }

    return entries.map(([key, value]) => `${key}=${value}`).join(', ');
  }

  private async fetchAppleMusicJsonUncached<T>(
    pathname: string,
    query?: Record<string, string | number | undefined>,
    retry = true,
  ): Promise<T> {
    const token = this.getDeveloperToken();
    const url = this.buildApiUrl(pathname, query);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 && retry) {
      this.cachedDeveloperToken = null;
      this.developerTokenExpiresAt = 0;
      return this.fetchAppleMusicJsonUncached<T>(pathname, query, false);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      const diagnosticHeaders = this.getAppleDiagnosticHeaders(response);
      const headerText = this.formatDiagnosticHeaders(diagnosticHeaders);
      this.logger.warn(
        `Apple Music API request failed status=${response.status} path=${pathname} query=${JSON.stringify(
          query ?? {},
        )} headers=${headerText} body=${errorBody.slice(0, 500) || 'empty'}`,
      );
      throw new BadGatewayException(
        `Apple Music API request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        } headers=${headerText}`,
      );
    }

    return this.parseJsonResponse<T>(response);
  }

  private async fetchAppleMusicJson<T>(
    pathname: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const cacheKey = this.getResponseCacheKey(pathname, query);
    const cachedResponse = this.getCachedResponse<T>(cacheKey);
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    if (!this.inFlightRequests.has(cacheKey)) {
      const requestPromise = this.fetchAppleMusicJsonUncached<T>(
        pathname,
        query,
      )
        .then((result) => {
          this.setCachedResponse(cacheKey, result);
          return result;
        })
        .finally(() => {
          this.inFlightRequests.delete(cacheKey);
        });

      this.inFlightRequests.set(cacheKey, requestPromise);
    }

    return this.inFlightRequests.get(cacheKey) as Promise<T>;
  }

  private getAppleMusicImageUrl(artwork: any, size = 1000) {
    const templateUrl = artwork?.url;
    if (typeof templateUrl !== 'string' || !templateUrl.trim()) {
      return null;
    }

    return templateUrl
      .replace('{w}', String(size))
      .replace('{h}', String(size))
      .replace('{c}', 'bb')
      .replace('{f}', 'jpg');
  }

  private normalizeAlbumSearchItems(rawResponse: any) {
    const albums = Array.isArray(rawResponse?.results?.albums?.data)
      ? rawResponse.results.albums.data
      : [];

    return albums.map((album) => {
      const attributes = album?.attributes || {};
      const artistName = attributes.artistName || 'Unknown Artist';
      const coverUrl = this.getAppleMusicImageUrl(attributes.artwork);

      return {
        id: album?.id || null,
        title: attributes.name || null,
        releaseDate: attributes.releaseDate || null,
        barcodeId: attributes.upc || null,
        artists: [{ id: null, name: artistName, raw: null }],
        artistName,
        coverUrl,
        artwork: attributes.artwork || null,
        trackCount: attributes.trackCount || null,
        genreNames: Array.isArray(attributes.genreNames)
          ? attributes.genreNames
          : [],
        url: attributes.url || null,
        raw: album,
      };
    });
  }

  async searchAlbums(
    query: string,
    limit = 10,
    storefront?: string,
    offset = 0,
  ) {
    const normalizedQuery = this.normalizeSearchQuery(query);
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedOffset = this.normalizeOffset(offset);
    const normalizedStorefront = this.normalizeStorefront(storefront);

    const rawResponse = await this.fetchAppleMusicJson(
      `/catalog/${encodeURIComponent(normalizedStorefront)}/search`,
      {
        term: normalizedQuery,
        types: 'albums',
        limit: normalizedLimit,
        offset: normalizedOffset,
      },
    );

    return {
      items: this.normalizeAlbumSearchItems(rawResponse),
      raw: rawResponse,
      storefront: normalizedStorefront,
    };
  }
}
