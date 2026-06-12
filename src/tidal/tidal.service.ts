import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(TidalService.name);
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

  private getTidalDiagnosticHeaders(response: Response) {
    const diagnosticHeaderNames = [
      'retry-after',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'x-rate-limit-limit',
      'x-rate-limit-remaining',
      'x-rate-limit-reset',
      'ratelimit-limit',
      'ratelimit-remaining',
      'ratelimit-reset',
      'tidal-ratelimit-limit',
      'tidal-ratelimit-remaining',
      'tidal-ratelimit-reset',
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
      const diagnosticHeaders = this.getTidalDiagnosticHeaders(response);
      this.logger.warn(
        `TIDAL token request failed status=${response.status} rateHeaders=${this.formatDiagnosticHeaders(
          diagnosticHeaders,
        )} body=${errorBody.slice(0, 500) || 'empty'}`,
      );
      throw new BadGatewayException(
        `TIDAL token request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        } rateHeaders=${this.formatDiagnosticHeaders(diagnosticHeaders)}`,
      );
    }

    if (response.status === 429) {
      const diagnosticHeaders = this.getTidalDiagnosticHeaders(response);
      this.logger.warn(
        `TIDAL token rate limit status=429 rateHeaders=${this.formatDiagnosticHeaders(
          diagnosticHeaders,
        )}`,
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
    query?: Record<string, string | number | string[] | undefined>,
  ) {
    const url = new URL(`${this.apiBaseUrl}${pathname}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== undefined && item !== null && item !== '') {
              url.searchParams.append(key, String(item));
            }
          }
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    return url;
  }

  private getResponseCacheKey(
    pathname: string,
    query?: Record<string, string | number | string[] | undefined>,
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
    query?: Record<string, string | number | string[] | undefined>,
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
      const diagnosticHeaders = this.getTidalDiagnosticHeaders(response);
      const rateHeaderText = this.formatDiagnosticHeaders(diagnosticHeaders);
      const bodySnippet = errorBody.slice(0, 500) || 'empty';
      this.logger.warn(
        `TIDAL API request failed status=${response.status} path=${pathname} query=${JSON.stringify(
          query ?? {},
        )} rateHeaders=${rateHeaderText} body=${bodySnippet}`,
      );
      throw new BadGatewayException(
        `TIDAL API request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        } rateHeaders=${rateHeaderText}`,
      );
    }

    return this.parseJsonResponse<T>(response);
  }

  private async fetchTidalJson<T>(
    pathname: string,
    query?: Record<string, string | number | string[] | undefined>,
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

  private getIncludedById(rawResponse: any) {
    const includedById = new Map<string, any>();

    for (const item of Array.isArray(rawResponse?.included)
      ? rawResponse.included
      : []) {
      if (item?.id && item?.type) {
        includedById.set(`${item.type}:${item.id}`, item);
      }
    }

    return includedById;
  }

  private getTidalImageUrl(artwork: any) {
    const attributes = artwork?.attributes || {};
    const files = Array.isArray(attributes.files) ? attributes.files : [];
    const largestFile = files
      .filter((file) => file?.href)
      .sort((left, right) => {
        const leftPixels =
          Number(left?.meta?.width || 0) * Number(left?.meta?.height || 0);
        const rightPixels =
          Number(right?.meta?.width || 0) * Number(right?.meta?.height || 0);
        return rightPixels - leftPixels;
      })[0];

    if (largestFile?.href) {
      return largestFile.href;
    }

    const imageLinks = attributes.imageLinks || attributes.image_links;

    if (Array.isArray(imageLinks)) {
      const firstImage = imageLinks.find(Boolean);
      return typeof firstImage === 'string'
        ? firstImage
        : firstImage?.href || firstImage?.url || null;
    }

    if (imageLinks && typeof imageLinks === 'object') {
      return (
        imageLinks.large ||
        imageLinks.medium ||
        imageLinks.small ||
        imageLinks.href ||
        imageLinks.url ||
        null
      );
    }

    return (
      attributes.url ||
      attributes.href ||
      attributes.imageUrl ||
      attributes.image_url ||
      attributes.coverUrl ||
      attributes.cover_url ||
      null
    );
  }

  private getRelationshipData(resource: any, relationshipName: string) {
    const relationshipData = resource?.relationships?.[relationshipName]?.data;

    if (Array.isArray(relationshipData)) {
      return relationshipData;
    }

    return relationshipData ? [relationshipData] : [];
  }

  private normalizeAlbumSearchItems(rawResponse: any) {
    const includedById = this.getIncludedById(rawResponse);

    const relationshipItems = Array.isArray(rawResponse?.data)
      ? rawResponse.data
      : Array.isArray(rawResponse?.data?.relationships?.albums?.data)
        ? rawResponse.data.relationships.albums.data
        : [];

    return relationshipItems.map((item) => {
      const album =
        includedById.get(`${item?.type || 'albums'}:${item?.id}`) || item;
      const attributes = album?.attributes || {};
      const artistRelationships = this.getRelationshipData(album, 'artists');
      const artists = artistRelationships
        .map((artist) => includedById.get(`${artist.type}:${artist.id}`))
        .filter(Boolean)
        .map((artist) => ({
          id: artist.id,
          name: artist.attributes?.name || null,
          raw: artist,
        }));
      const coverArtRelationships = this.getRelationshipData(album, 'coverArt');
      const coverArt = coverArtRelationships
        .map((artwork) => includedById.get(`${artwork.type}:${artwork.id}`))
        .find(Boolean);

      return {
        id: album?.id || item?.id || null,
        title: attributes.title || attributes.name || null,
        releaseDate: attributes.releaseDate || attributes.release_date || null,
        barcodeId: attributes.barcodeId || null,
        artists,
        coverUrl: this.getTidalImageUrl(coverArt),
        coverArt: coverArt || null,
        raw: album,
      };
    });
  }

  private async getAlbumMetadataByIds(albumIds: string[], countryCode: string) {
    if (albumIds.length === 0) {
      return null;
    }

    return this.fetchTidalJson('/albums', {
      countryCode,
      include: 'artists',
      'filter[id]': albumIds,
    });
  }

  private normalizeCoverArtRelationship(rawResponse: any) {
    const includedById = this.getIncludedById(rawResponse);
    const coverArtItems = Array.isArray(rawResponse?.data)
      ? rawResponse.data
      : rawResponse?.data
        ? [rawResponse.data]
        : [];
    const coverArt = coverArtItems
      .map((artwork) => includedById.get(`${artwork.type}:${artwork.id}`))
      .filter(Boolean)
      .map((artwork) => ({
        id: artwork.id,
        coverUrl: this.getTidalImageUrl(artwork),
        raw: artwork,
      }))
      .find((artwork) => artwork.coverUrl);

    return coverArt || null;
  }

  private async getAlbumCoverArt(albumId: string, countryCode: string) {
    const rawResponse = await this.fetchTidalJson(
      `/albums/${encodeURIComponent(albumId)}/relationships/coverArt`,
      {
        countryCode,
        include: 'coverArt',
      },
    );

    const coverArt = this.normalizeCoverArtRelationship(rawResponse);

    return {
      id: coverArt?.id || null,
      coverUrl: coverArt?.coverUrl || null,
      raw: coverArt?.raw || null,
      rawResponse,
    };
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
    const searchItems = this.normalizeAlbumSearchItems(rawResponse).slice(
      0,
      normalizedLimit,
    );
    const albumIds = searchItems
      .map((album) => album.id)
      .filter((albumId): albumId is string => Boolean(albumId));
    const albumMetadataResponse = await this.getAlbumMetadataByIds(
      albumIds,
      normalizedCountryCode,
    );
    const metadataItems = albumMetadataResponse
      ? this.normalizeAlbumSearchItems(albumMetadataResponse)
      : [];
    const metadataById = new Map(
      metadataItems.map((album) => [album.id, album]),
    );
    const coverArtResults = await Promise.all(
      albumIds.map(async (albumId) => [
        albumId,
        await this.getAlbumCoverArt(albumId, normalizedCountryCode),
      ] as const),
    );
    const coverArtByAlbumId = new Map(coverArtResults);

    return {
      items: searchItems.map((album) => {
        const metadataAlbum = metadataById.get(album.id) || album;
        const coverArt = coverArtByAlbumId.get(album.id) as
          | { coverUrl?: string | null; raw?: unknown }
          | undefined;

        return {
          ...metadataAlbum,
          coverUrl: coverArt?.coverUrl || metadataAlbum.coverUrl || null,
          coverArt: coverArt?.raw || metadataAlbum.coverArt || null,
        };
      }),
      raw: rawResponse,
      albumMetadataRaw: albumMetadataResponse,
      countryCode: normalizedCountryCode,
    };
  }
}
