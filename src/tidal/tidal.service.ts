import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type TidalTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type TidalResponseCacheEntry = {
  expiresAt: number;
  value: unknown;
};

@Injectable()
export class TidalService {
  private readonly authUrl = 'https://auth.tidal.com/v1/oauth2/token';
  private readonly apiBaseUrl = 'https://openapi.tidal.com/v2';
  private readonly maxSearchLimit = 20;
  private readonly maxQueryLength = 120;
  private readonly responseCacheTtlMs = 5 * 60 * 1000;
  private readonly responseCacheMaxEntries = 250;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenPromise: Promise<string> | null = null;
  private readonly responseCache = new Map<string, TidalResponseCacheEntry>();
  private readonly inFlightRequests = new Map<string, Promise<unknown>>();

  private getCredentials() {
    const clientId = process.env.TIDAL_CLIENT_ID?.trim();
    const clientSecret = process.env.TIDAL_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'TIDAL credentials are not configured',
      );
    }

    return { clientId, clientSecret };
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new BadGatewayException('TIDAL returned an invalid response');
    }
  }

  private async requestNewAccessToken(): Promise<string> {
    const { clientId, clientSecret } = this.getCredentials();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    const response = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadGatewayException(
        `TIDAL token request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        }`,
      );
    }

    const tokenResponse =
      await this.parseJsonResponse<TidalTokenResponse>(response);
    const accessToken = tokenResponse.access_token?.trim();
    const expiresInSeconds =
      typeof tokenResponse.expires_in === 'number'
        ? tokenResponse.expires_in
        : 86400;

    if (!accessToken) {
      throw new BadGatewayException('TIDAL token response was missing a token');
    }

    this.cachedToken = accessToken;
    this.tokenExpiresAt =
      Date.now() + Math.max(expiresInSeconds - 60, 30) * 1000;

    return accessToken;
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (!this.tokenPromise) {
      this.tokenPromise = this.requestNewAccessToken().finally(() => {
        this.tokenPromise = null;
      });
    }

    return this.tokenPromise;
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

  private normalizeCountryCode(countryCode?: string): string {
    const normalizedCountryCode =
      countryCode?.trim() || process.env.TIDAL_COUNTRY_CODE?.trim() || 'US';

    if (!/^[A-Za-z]{2}$/.test(normalizedCountryCode)) {
      return 'US';
    }

    return normalizedCountryCode.toUpperCase();
  }

  private async fetchTidalJsonUncached<T>(
    pathname: string,
    query?: Record<string, string | number | undefined>,
    retry = true,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.buildApiUrl(pathname, query);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.api+json',
      },
    });

    if (response.status === 401 && retry) {
      this.cachedToken = null;
      this.tokenExpiresAt = 0;
      return this.fetchTidalJsonUncached<T>(pathname, query, false);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadGatewayException(
        `TIDAL API request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        }`,
      );
    }

    return this.parseJsonResponse<T>(response);
  }

  private async fetchTidalJson<T>(
    pathname: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const cacheKey = this.getResponseCacheKey(pathname, query);
    const cachedResponse = this.getCachedResponse<T>(cacheKey);
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    if (!this.inFlightRequests.has(cacheKey)) {
      const requestPromise = this.fetchTidalJsonUncached<T>(pathname, query)
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

  private normalizeAlbumSearchItems(rawResponse: any) {
    const includedById = new Map<string, any>();

    for (const item of Array.isArray(rawResponse?.included)
      ? rawResponse.included
      : []) {
      if (item?.id && item?.type) {
        includedById.set(`${item.type}:${item.id}`, item);
      }
    }

    const relationshipItems = Array.isArray(rawResponse?.data)
      ? rawResponse.data
      : Array.isArray(rawResponse?.data?.relationships?.albums?.data)
        ? rawResponse.data.relationships.albums.data
        : [];

    return relationshipItems.map((item) => {
      const album =
        includedById.get(`${item?.type || 'albums'}:${item?.id}`) || item;
      const attributes = album?.attributes || {};
      const artistRelationships = Array.isArray(
        album?.relationships?.artists?.data,
      )
        ? album.relationships.artists.data
        : [];
      const artists = artistRelationships
        .map((artist) => includedById.get(`${artist.type}:${artist.id}`))
        .filter(Boolean)
        .map((artist) => ({
          id: artist.id,
          name: artist.attributes?.name || null,
          raw: artist,
        }));

      return {
        id: album?.id || item?.id || null,
        title: attributes.title || attributes.name || null,
        releaseDate: attributes.releaseDate || attributes.release_date || null,
        barcodeId: attributes.barcodeId || null,
        artists,
        raw: album,
      };
    });
  }

  async searchAlbums(
    query: string,
    limit = 10,
    countryCode?: string,
    cursor?: string,
  ) {
    const normalizedQuery = this.normalizeSearchQuery(query);
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedCountryCode = this.normalizeCountryCode(countryCode);

    const rawResponse = await this.fetchTidalJson(
      `/searchResults/${encodeURIComponent(normalizedQuery)}/relationships/albums`,
      {
        countryCode: normalizedCountryCode,
        explicitFilter: 'INCLUDE',
        include: 'albums',
        'page[cursor]': cursor,
      },
    );

    return {
      items: this.normalizeAlbumSearchItems(rawResponse).slice(
        0,
        normalizedLimit,
      ),
      raw: rawResponse,
      countryCode: normalizedCountryCode,
    };
  }
}
