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

@Injectable()
export class SpotifyService {
  private readonly authUrl = 'https://accounts.spotify.com/api/token';
  private readonly apiBaseUrl = 'https://api.spotify.com/v1';
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenPromise: Promise<string> | null = null;

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

  private async fetchSpotifyJson<T>(
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
      return this.fetchSpotifyJson<T>(pathname, query, false);
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
    if (!query?.trim()) {
      throw new BadRequestException('q is required');
    }

    return this.fetchSpotifyJson('/search', {
      q: query.trim(),
      type: 'album',
      limit,
      offset,
      market: market?.trim() || undefined,
    });
  }

  async searchArtists(query: string, limit = 10, offset = 0) {
    if (!query?.trim()) {
      throw new BadRequestException('q is required');
    }

    return this.fetchSpotifyJson('/search', {
      q: query.trim(),
      type: 'artist',
      limit,
      offset,
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
