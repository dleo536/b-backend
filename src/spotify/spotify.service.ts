import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type SpotifyTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type SpotifyResponseCacheEntry = {
  expiresAt: number;
  value: unknown;
};

@Injectable()
export class SpotifyService {
  private readonly authUrl = 'https://accounts.spotify.com/api/token';
  private readonly apiBaseUrl = 'https://api.spotify.com/v1';
  private readonly maxSearchLimit = 25;
  private readonly maxSearchOffset = 1000;
  private readonly maxQueryLength = 120;
  private readonly responseCacheTtlMs = 5 * 60 * 1000;
  private readonly responseCacheMaxEntries = 250;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenPromise: Promise<string> | null = null;
  private readonly responseCache = new Map<string, SpotifyResponseCacheEntry>();
  private readonly inFlightRequests = new Map<string, Promise<unknown>>();

  private getCredentials() {
    const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Spotify credentials are not configured',
      );
    }

    return { clientId, clientSecret };
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new BadGatewayException('Spotify returned an invalid response');
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
        `Spotify token request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        }`,
      );
    }

    const tokenResponse =
      await this.parseJsonResponse<SpotifyTokenResponse>(response);
    const accessToken = tokenResponse.access_token?.trim();
    const expiresInSeconds =
      typeof tokenResponse.expires_in === 'number'
        ? tokenResponse.expires_in
        : 3600;

    if (!accessToken) {
      throw new BadGatewayException('Spotify token response was missing a token');
    }

    this.cachedToken = accessToken;
    this.tokenExpiresAt = Date.now() + Math.max(expiresInSeconds - 60, 30) * 1000;

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

  private buildApiUrl(pathname: string, query?: Record<string, string | number | undefined>) {
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

  private normalizeOffset(offset = 0): number {
    if (!Number.isFinite(offset)) {
      return 0;
    }

    return Math.min(Math.max(Math.trunc(offset), 0), this.maxSearchOffset);
  }

  private normalizeMarket(market?: string): string | undefined {
    const normalizedMarket = market?.trim();

    if (!normalizedMarket) {
      return undefined;
    }

    if (!/^[A-Za-z]{2}$/.test(normalizedMarket)) {
      return undefined;
    }

    return normalizedMarket.toUpperCase();
  }

  private async fetchSpotifyJsonUncached<T>(
    pathname: string,
    query?: Record<string, string | number | undefined>,
    retry = true,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.buildApiUrl(pathname, query);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 && retry) {
      this.cachedToken = null;
      this.tokenExpiresAt = 0;
      return this.fetchSpotifyJsonUncached<T>(pathname, query, false);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadGatewayException(
        `Spotify API request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        }`,
      );
    }

    return this.parseJsonResponse<T>(response);
  }

  private async fetchSpotifyJson<T>(
    pathname: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const cacheKey = this.getResponseCacheKey(pathname, query);
    const cachedResponse = this.getCachedResponse<T>(cacheKey);
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    if (!this.inFlightRequests.has(cacheKey)) {
      const requestPromise = this.fetchSpotifyJsonUncached<T>(pathname, query)
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

  async getAlbum(albumId: string) {
    if (!albumId?.trim()) {
      throw new BadRequestException('albumId is required');
    }

    return this.fetchSpotifyJson(`/albums/${encodeURIComponent(albumId.trim())}`);
  }

  async getAlbumTracks(albumId: string) {
    if (!albumId?.trim()) {
      throw new BadRequestException('albumId is required');
    }

    const response = await this.fetchSpotifyJson<{ items?: unknown[] }>(
      `/albums/${encodeURIComponent(albumId.trim())}/tracks`,
    );

    return response.items ?? [];
  }

  async searchAlbums(
    query: string,
    limit = 10,
    offset = 0,
    market?: string,
  ) {
    const normalizedQuery = this.normalizeSearchQuery(query);
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedOffset = this.normalizeOffset(offset);
    const normalizedMarket = this.normalizeMarket(market);

    return this.fetchSpotifyJson('/search', {
      q: normalizedQuery,
      type: 'album',
      limit: normalizedLimit,
      offset: normalizedOffset,
      market: normalizedMarket,
    });
  }

  async searchArtists(query: string, limit = 10, offset = 0) {
    const normalizedQuery = this.normalizeSearchQuery(query);
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedOffset = this.normalizeOffset(offset);

    return this.fetchSpotifyJson('/search', {
      q: normalizedQuery,
      type: 'artist',
      limit: normalizedLimit,
      offset: normalizedOffset,
    });
  }

  async getArtistById(artistId: string) {
    if (!artistId?.trim()) {
      throw new BadRequestException('artistId is required');
    }

    return this.fetchSpotifyJson(`/artists/${encodeURIComponent(artistId.trim())}`);
  }

  async getArtistByName(name: string) {
    const result = await this.searchArtists(name, 1, 0);
    const artists = Array.isArray((result as any)?.artists?.items)
      ? (result as any).artists.items
      : [];

    return artists[0] ?? null;
  }

  async getArtistAlbums(artistId: string) {
    if (!artistId?.trim()) {
      throw new BadRequestException('artistId is required');
    }

    const result = await this.fetchSpotifyJson<{ items?: unknown[] }>(
      `/artists/${encodeURIComponent(artistId.trim())}/albums`,
      {
        include_groups: 'album',
      },
    );

    return result.items ?? [];
  }
}
