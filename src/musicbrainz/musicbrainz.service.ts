import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { AppleMusicService } from '../apple-music/apple-music.service';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type LoggedProviderError = Error & {
  providerCallLogged?: true;
};

export type NormalizedAlbumSearchResult = {
  id: string;
  name: string;
  title: string;
  artists: Array<{ id: string | null; name: string }>;
  artistName: string;
  release_date: string | null;
  releaseYear: string | null;
  firstReleaseDate: string | null;
  album_type: string;
  images: Array<{ url: string }>;
  coverUrl: string | null;
  coverArtUrl: string | null;
  coverArtSource: CoverArtSource;
  coverArtProvider: CoverArtProvider | null;
  coverArtAttribution: string | null;
  musicbrainzReleaseGroupId: string;
  musicbrainzArtistId: string | null;
  primaryType: string;
  secondaryTypes: string[];
  source: 'musicbrainz';
  sourceProvider: 'musicbrainz';
};

export type NormalizedArtistSearchResult = {
  id: string;
  name: string;
  sortName: string | null;
  musicbrainzArtistId: string;
  type: string | null;
  country: string | null;
  disambiguation: string | null;
  lifeSpan: {
    begin: string | null;
    end: string | null;
    ended: boolean | null;
  };
  imageUrl: string | null;
  imageSource: 'fanart_tv' | null;
  imageType: ArtistImageType | null;
  images: Array<{ url: string }>;
  genres: string[];
  source: 'musicbrainz';
  sourceProvider: 'musicbrainz';
};

export type MusicBrainzUnavailableSearchResult = {
  items: [];
  provider: 'musicbrainz';
  providerUnavailable: true;
  error: string;
};

type CoverArtProvider = 'cover_art_archive' | 'fanart_tv' | 'apple_music';

type CoverArtSource =
  | 'cover_art_archive_release'
  | 'cover_art_archive_release_group'
  | 'fanart_tv'
  | 'apple_music'
  | null;

type ResolvedCoverArt = {
  url: string;
  source: Exclude<CoverArtSource, null>;
  provider: CoverArtProvider;
  attribution: string | null;
  musicbrainzReleaseId?: string | null;
  appleMusicAlbumId?: string | null;
  fanartReleaseGroupMbid?: string | null;
};

type AlbumPersonnelTrackCredit = {
  title: string;
  position: string | null;
  roles: string[];
};

type AlbumPersonnelPerson = {
  name: string;
  musicbrainzArtistId: string | null;
  roles: string[];
  albumLevelRoles: string[];
  tracks: AlbumPersonnelTrackCredit[];
};

type AlbumPersonnelResponse = {
  releaseGroupMbid: string;
  releaseMbid: string | null;
  source: 'musicbrainz';
  personnel: AlbumPersonnelPerson[];
};

type AlbumTrack = {
  position: string;
  number: string | null;
  discNumber: number | null;
  title: string;
  lengthMs: number | null;
  recordingMbid: string | null;
  artistName: string;
};

type AlbumTracksResponse = {
  releaseGroupMbid: string;
  releaseMbid: string | null;
  title?: string;
  artistName?: string;
  source: 'musicbrainz';
  tracks: AlbumTrack[];
};

type OtherAlbum = {
  id: string;
  musicbrainzReleaseGroupId: string;
  title: string;
  name: string;
  artistName: string;
  artists: Array<{ id: string | null; name: string }>;
  firstReleaseDate: string | null;
  release_date: string | null;
  releaseYear: number | null;
  primaryType: string | null;
  secondaryTypes: string[];
  coverArtUrl: string | null;
  coverUrl: string | null;
  coverArtSource: CoverArtSource;
  coverArtProvider: CoverArtProvider | null;
  coverArtAttribution: string | null;
  images: Array<{ url: string }>;
  source: 'musicbrainz';
  sourceProvider: 'musicbrainz';
};

type OtherAlbumsResponse = {
  releaseGroupMbid: string;
  artistMbid: string | null;
  artistName: string | null;
  source: 'musicbrainz';
  albums: OtherAlbum[];
};

type ArtistImageType =
  | 'artistbackground'
  | 'artistthumb'
  | 'musicbanner'
  | 'hdmusiclogo';

type AlbumArtistImageResponse = {
  releaseGroupMbid: string;
  artistMbid: string | null;
  artistName: string | null;
  imageUrl: string | null;
  source: 'fanart_tv';
  imageType: ArtistImageType | null;
  attributionText: string | null;
};

type ArtistSearchImageResult = {
  imageUrl: string | null;
  imageSource: 'fanart_tv' | null;
  imageType: ArtistImageType | null;
};

type ArtistProfileResponse = {
  id: string;
  musicbrainzArtistId: string;
  name: string;
  sortName: string | null;
  type: string | null;
  country: string | null;
  disambiguation: string | null;
  lifeSpan: {
    begin: string | null;
    end: string | null;
    ended: boolean | null;
  };
  description: string | null;
  descriptionSource: string | null;
  imageUrl: string | null;
  imageSource: 'fanart_tv' | null;
  imageType: ArtistImageType | null;
  images: Array<{ url: string }>;
  genres: string[];
  catalog: OtherAlbum[];
  source: 'musicbrainz';
  sourceProvider: 'musicbrainz';
};

type MutablePersonnelPerson = {
  name: string;
  musicbrainzArtistId: string | null;
  roles: Set<string>;
  albumLevelRoles: Set<string>;
  tracks: Map<
    string,
    { title: string; position: string | null; roles: Set<string> }
  >;
};

@Injectable()
export class MusicBrainzService {
  private readonly logger = new Logger(MusicBrainzService.name);
  private readonly defaultMusicBrainzBaseUrl =
    'https://musicbrainz-full.bsides.pro/ws/2';
  private readonly defaultCoverArtArchiveBaseUrl =
    'https://coverartarchive.org';
  private readonly maxSearchLimit = 20;
  private readonly maxSearchOffset = 1000;
  private readonly artistCatalogPageSize = 100;
  private readonly maxArtistCatalogLimit = 500;
  private readonly maxQueryLength = 120;
  private readonly requestTimeoutMs = 7000;
  private readonly personnelRequestTimeoutMs = 10000;
  private readonly fanartRequestTimeoutMs = 7000;
  private readonly coverArtTimeoutMs = 2500;
  private readonly maxOtherAlbumsCoverArtLookups = 24;
  private readonly otherAlbumsCoverArtConcurrency = 6;
  private readonly maxArtistSearchImageLookups = 10;
  private readonly artistSearchImageConcurrency = 5;
  private readonly cacheTtlMs = 10 * 60 * 1000;
  private readonly artistImageFoundCacheTtlMs = 30 * 24 * 60 * 60 * 1000;
  private readonly artistImageMissingCacheTtlMs = 7 * 24 * 60 * 60 * 1000;
  private readonly coverArtCache = new Map<string, CacheEntry<string | null>>();
  private readonly resolvedCoverArtCache = new Map<
    string,
    CacheEntry<ResolvedCoverArt | null>
  >();
  private readonly artistImageCache = new Map<
    string,
    CacheEntry<AlbumArtistImageResponse>
  >();
  private readonly artistSearchImageCache = new Map<
    string,
    CacheEntry<ArtistSearchImageResult>
  >();
  private readonly responseCache = new Map<string, CacheEntry<unknown>>();

  constructor(
    @Optional()
    private readonly appleMusicService?: AppleMusicService,
  ) {}

  private get musicBrainzBaseUrl() {
    return (
      process.env.MUSICBRAINZ_BASE_URL?.trim() || this.defaultMusicBrainzBaseUrl
    ).replace(/\/+$/, '');
  }

  private get coverArtArchiveBaseUrl() {
    return (
      process.env.COVER_ART_ARCHIVE_BASE_URL?.trim() ||
      this.defaultCoverArtArchiveBaseUrl
    ).replace(/\/+$/, '');
  }

  private get fanartBaseUrl() {
    return (
      process.env.FANART_BASE_URL?.trim() ||
      'https://webservice.fanart.tv/v3/music'
    ).replace(/\/+$/, '');
  }

  private normalizeSearchQuery(query: string): string {
    const normalizedQuery = query?.trim();

    if (!normalizedQuery) {
      throw new BadRequestException('q is required');
    }

    return normalizedQuery.slice(0, this.maxQueryLength);
  }

  private normalizeLimit(limit = 20): number {
    if (!Number.isFinite(limit)) {
      return this.maxSearchLimit;
    }

    return Math.min(Math.max(Math.trunc(limit), 1), this.maxSearchLimit);
  }

  private normalizeArtistCatalogLimit(limit = this.maxArtistCatalogLimit) {
    if (!Number.isFinite(limit)) {
      return this.maxArtistCatalogLimit;
    }

    return Math.min(Math.max(Math.trunc(limit), 1), this.maxArtistCatalogLimit);
  }

  private normalizeOffset(offset = 0): number {
    if (!Number.isFinite(offset)) {
      return 0;
    }

    return Math.min(Math.max(Math.trunc(offset), 0), this.maxSearchOffset);
  }

  private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
    const entry = cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private setCached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
    ttlMs = this.cacheTtlMs,
  ) {
    if (cache.size >= 250) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private buildMusicBrainzUrl(
    pathname: string,
    query: Record<string, string | number | undefined>,
  ) {
    const url = new URL(`${this.musicBrainzBaseUrl}${pathname}`);

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        return;
      }

      url.searchParams.set(key, String(value));
    });

    return url;
  }

  private getProviderLogContext(provider: string, url: URL) {
    return {
      provider,
      baseUrl:
        provider === 'musicbrainz'
          ? this.musicBrainzBaseUrl
          : this.coverArtArchiveBaseUrl,
      endpoint: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    };
  }

  private logProviderCall(
    level: 'log' | 'warn',
    context: Record<string, unknown>,
  ) {
    this.logger[level](JSON.stringify(context));
  }

  private buildFanartUrl(artistMbid: string) {
    const apiKey = process.env.FANART_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }

    const url = new URL(
      `${this.fanartBaseUrl}/${encodeURIComponent(artistMbid)}`,
    );
    url.searchParams.set('api_key', apiKey);
    return url;
  }

  private buildFanartAlbumUrl(releaseGroupMbid: string) {
    const apiKey = process.env.FANART_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }

    const url = new URL(
      `${this.fanartBaseUrl}/albums/${encodeURIComponent(releaseGroupMbid)}`,
    );
    url.searchParams.set('api_key', apiKey);
    return url;
  }

  private selectFanartArtistImage(
    fanartResponse: any,
    preferredTypes: ArtistImageType[] = [
      'artistbackground',
      'artistthumb',
      'musicbanner',
      'hdmusiclogo',
    ],
  ): {
    imageUrl: string | null;
    imageType: ArtistImageType | null;
  } {
    for (const imageType of preferredTypes) {
      const images = Array.isArray(fanartResponse?.[imageType])
        ? fanartResponse[imageType]
        : [];
      const imageUrl = images
        .map((image) =>
          typeof image === 'string'
            ? image
            : image?.url || image?.image || image?.href,
        )
        .find((url) => typeof url === 'string' && url.trim());

      if (imageUrl) {
        return {
          imageUrl: this.normalizeCoverArtUrl(imageUrl) || imageUrl.trim(),
          imageType,
        };
      }
    }

    return {
      imageUrl: null,
      imageType: null,
    };
  }

  private selectFanartAlbumCover(fanartResponse: any): string | null {
    const albumCovers = Array.isArray(fanartResponse?.albumcover)
      ? fanartResponse.albumcover
      : [];
    const albumCoverUrl = albumCovers
      .map((image) => image?.url)
      .find((url) => typeof url === 'string' && url.trim());

    return this.normalizeCoverArtUrl(albumCoverUrl || null);
  }

  private async fetchFanartAlbumCover(
    releaseGroupMbid: string,
  ): Promise<ResolvedCoverArt | null> {
    const url = this.buildFanartAlbumUrl(releaseGroupMbid);
    if (!url) {
      this.logger.warn(
        JSON.stringify({
          provider: 'fanart_tv',
          fallbackFor: 'cover_art',
          releaseGroupMbid,
          configured: false,
          error: 'FANART_API_KEY is not configured',
        }),
      );
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.fanartRequestTimeoutMs,
    );
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;

      if (response.status === 404) {
        this.logger.log(
          JSON.stringify({
            provider: 'fanart_tv',
            fallbackFor: 'cover_art',
            endpoint: `/albums/${releaseGroupMbid}`,
            releaseGroupMbid,
            durationMs,
            status: response.status,
            imageFound: false,
            imageType: null,
          }),
        );
        return null;
      }

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            provider: 'fanart_tv',
            fallbackFor: 'cover_art',
            endpoint: `/albums/${releaseGroupMbid}`,
            releaseGroupMbid,
            durationMs,
            status: response.status,
            error: `fanart.tv album cover request failed status=${response.status}`,
          }),
        );
        return null;
      }

      const data = await response.json();
      const albumCoverUrl = this.selectFanartAlbumCover(data);
      this.logger.log(
        JSON.stringify({
          provider: 'fanart_tv',
          fallbackFor: 'cover_art',
          endpoint: `/albums/${releaseGroupMbid}`,
          releaseGroupMbid,
          durationMs,
          status: response.status,
          imageFound: Boolean(albumCoverUrl),
          imageType: albumCoverUrl ? 'albumcover' : null,
        }),
      );

      if (!albumCoverUrl) {
        return null;
      }

      return {
        url: albumCoverUrl,
        source: 'fanart_tv',
        provider: 'fanart_tv',
        attribution: 'Artwork from fanart.tv',
        musicbrainzReleaseId: null,
        fanartReleaseGroupMbid: releaseGroupMbid,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = (error as Error)?.name === 'AbortError';
      this.logger.warn(
        JSON.stringify({
          provider: 'fanart_tv',
          fallbackFor: 'cover_art',
          endpoint: `/albums/${releaseGroupMbid}`,
          releaseGroupMbid,
          durationMs,
          timeout: isTimeout,
          error: isTimeout
            ? 'fanart.tv album cover request timed out'
            : (error as Error)?.message ||
              'fanart.tv album cover request failed',
        }),
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchFanartArtistImage(
    artistMbid: string,
    artistName: string | null,
    preferredTypes?: ArtistImageType[],
  ): Promise<
    Pick<AlbumArtistImageResponse, 'imageUrl' | 'imageType' | 'attributionText'>
  > {
    const url = this.buildFanartUrl(artistMbid);
    if (!url) {
      this.logger.warn(
        JSON.stringify({
          provider: 'fanart_tv',
          configured: false,
          artistMbid,
          artistName,
          error: 'FANART_API_KEY is not configured',
        }),
      );
      return {
        imageUrl: null,
        imageType: null,
        attributionText: null,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.fanartRequestTimeoutMs,
    );
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;

      if (response.status === 404) {
        this.logger.log(
          JSON.stringify({
            provider: 'fanart_tv',
            endpoint: `/${artistMbid}`,
            artistMbid,
            artistName,
            durationMs,
            status: response.status,
            imageFound: false,
            imageType: null,
          }),
        );
        return {
          imageUrl: null,
          imageType: null,
          attributionText: null,
        };
      }

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            provider: 'fanart_tv',
            endpoint: `/${artistMbid}`,
            artistMbid,
            artistName,
            durationMs,
            status: response.status,
            error: `fanart.tv request failed status=${response.status}`,
          }),
        );
        return {
          imageUrl: null,
          imageType: null,
          attributionText: null,
        };
      }

      const data = await response.json();
      const selectedImage = this.selectFanartArtistImage(data, preferredTypes);
      this.logger.log(
        JSON.stringify({
          provider: 'fanart_tv',
          endpoint: `/${artistMbid}`,
          artistMbid,
          artistName,
          durationMs,
          status: response.status,
          imageFound: Boolean(selectedImage.imageUrl),
          imageType: selectedImage.imageType,
        }),
      );

      return {
        ...selectedImage,
        attributionText: selectedImage.imageUrl ? 'Image from fanart.tv' : null,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = (error as Error)?.name === 'AbortError';
      this.logger.warn(
        JSON.stringify({
          provider: 'fanart_tv',
          endpoint: `/${artistMbid}`,
          artistMbid,
          artistName,
          durationMs,
          timeout: isTimeout,
          error: isTimeout
            ? 'fanart.tv request timed out'
            : (error as Error)?.message || 'fanart.tv request failed',
        }),
      );

      return {
        imageUrl: null,
        imageType: null,
        attributionText: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getFanartArtistSearchImage(
    artistMbid: string,
    artistName: string | null,
  ): Promise<ArtistSearchImageResult> {
    const cacheKey = `artist-search-image:${artistMbid}`;
    const cached = this.getCached(this.artistSearchImageCache, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const fanartImage = await this.fetchFanartArtistImage(
      artistMbid,
      artistName,
      ['artistthumb', 'artistbackground', 'musicbanner'],
    );
    const result: ArtistSearchImageResult = {
      imageUrl: fanartImage.imageUrl,
      imageSource: fanartImage.imageUrl ? 'fanart_tv' : null,
      imageType: fanartImage.imageType,
    };

    this.setCached(
      this.artistSearchImageCache,
      cacheKey,
      result,
      result.imageUrl
        ? this.artistImageFoundCacheTtlMs
        : this.artistImageMissingCacheTtlMs,
    );

    return result;
  }

  private createProviderUnavailable(
    error: unknown,
  ): MusicBrainzUnavailableSearchResult {
    return {
      items: [],
      provider: 'musicbrainz',
      providerUnavailable: true,
      error: (error as Error)?.message || 'MusicBrainz provider unavailable',
    };
  }

  private escapeLucenePhrase(value: string) {
    return value.replace(/(["\\])/g, '\\$1');
  }

  private async fetchJson<T>(url: URL, timeoutMs = this.requestTimeoutMs) {
    const cacheKey = url.toString();
    const cached = this.getCached<T>(
      this.responseCache as Map<string, CacheEntry<T>>,
      cacheKey,
    );
    if (cached !== undefined) {
      return cached;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const logContext = this.getProviderLogContext('musicbrainz', url);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        const errorBody = await response.text();
        const message = `MusicBrainz request failed (${response.status}): ${
          errorBody.slice(0, 180) || 'unknown error'
        }`;

        this.logProviderCall('warn', {
          ...logContext,
          durationMs,
          status: response.status,
          error: message,
        });

        const error = new Error(message) as LoggedProviderError;
        error.providerCallLogged = true;
        throw error;
      }

      this.logProviderCall('log', {
        ...logContext,
        durationMs,
        status: response.status,
      });

      const value = (await response.json()) as T;
      this.setCached(this.responseCache, cacheKey, value);
      return value;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message =
        (error as Error)?.name === 'AbortError'
          ? 'MusicBrainz request timed out'
          : (error as Error)?.message || 'MusicBrainz request failed';

      if (!(error as LoggedProviderError)?.providerCallLogged) {
        this.logProviderCall('warn', {
          ...logContext,
          durationMs,
          status: null,
          timeout: (error as Error)?.name === 'AbortError',
          error: message,
        });
      }

      if ((error as Error)?.name === 'AbortError') {
        throw new Error('MusicBrainz request timed out');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchCoverArtArchiveUrl(
    entityType: 'release' | 'release-group',
    mbid: string,
  ) {
    const cacheKey = `${entityType}:${mbid}`;
    const cached = this.getCached(this.coverArtCache, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const url = new URL(
      `${this.coverArtArchiveBaseUrl}/${entityType}/${encodeURIComponent(
        mbid,
      )}`,
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.coverArtTimeoutMs,
    );
    const startedAt = Date.now();
    const logContext = this.getProviderLogContext('cover_art_archive', url);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;

      if (response.status === 404) {
        this.logProviderCall('log', {
          ...logContext,
          durationMs,
          status: response.status,
        });
        this.setCached(this.coverArtCache, cacheKey, null);
        return null;
      }

      if (!response.ok) {
        this.logProviderCall('warn', {
          ...logContext,
          durationMs,
          status: response.status,
          error: `Cover Art Archive request failed status=${response.status}`,
        });
        this.setCached(this.coverArtCache, cacheKey, null);
        return null;
      }

      this.logProviderCall('log', {
        ...logContext,
        durationMs,
        status: response.status,
      });

      const value = await response.json();
      const coverArtUrl = this.selectCoverArtUrl(value);
      this.setCached(this.coverArtCache, cacheKey, coverArtUrl);
      return coverArtUrl;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = (error as Error)?.name === 'AbortError';

      this.logProviderCall('warn', {
        ...logContext,
        durationMs,
        status: null,
        timeout: isTimeout,
        error: isTimeout
          ? 'Cover Art Archive request timed out'
          : (error as Error)?.message || 'Cover Art Archive request failed',
      });
      this.setCached(this.coverArtCache, cacheKey, null);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /*
   * Soundtracks are currently included when MusicBrainz marks them as primary-type
   * Album; secondary-types are not used to exclude them here.
   */
  private isAlbumReleaseGroup(releaseGroup: any) {
    return releaseGroup?.['primary-type'] === 'Album';
  }

  private async unavailableIfMusicBrainzFails<T>(
    loader: () => Promise<T[]>,
  ): Promise<T[] | MusicBrainzUnavailableSearchResult> {
    try {
      return await loader();
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          provider: 'musicbrainz',
          providerUnavailable: true,
          baseUrl: this.musicBrainzBaseUrl,
          error:
            (error as Error)?.message || 'MusicBrainz provider unavailable',
        }),
      );

      return this.createProviderUnavailable(error);
    }
  }

  private selectCoverArtUrl(coverArtResponse: any): string | null {
    const images = Array.isArray(coverArtResponse?.images)
      ? coverArtResponse.images
      : [];
    const frontImage = images.find((image) => image?.front === true);
    const firstImage = images.find(Boolean);
    const firstAvailableThumbnail = images
      .map((image) => {
        const thumbnails = image?.thumbnails;
        if (!thumbnails || typeof thumbnails !== 'object') {
          return null;
        }

        return Object.values(thumbnails).find(
          (thumbnail) => typeof thumbnail === 'string' && thumbnail.trim(),
        );
      })
      .find(Boolean);

    return this.normalizeCoverArtUrl(
      frontImage?.thumbnails?.['500'] ||
        frontImage?.thumbnails?.large ||
        frontImage?.thumbnails?.['250'] ||
        firstAvailableThumbnail ||
        firstImage?.image ||
        null,
    );
  }

  private normalizeCoverArtUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const normalizedValue = value.trim();

    try {
      const url = new URL(normalizedValue);

      if (
        url.protocol === 'http:' &&
        url.hostname.toLowerCase().endsWith('coverartarchive.org')
      ) {
        url.protocol = 'https:';
        return url.toString();
      }

      return normalizedValue;
    } catch (error) {
      return normalizedValue;
    }
  }

  private async fetchReleaseGroupReleases(releaseGroupMbid: string) {
    const url = this.buildMusicBrainzUrl(
      `/release-group/${encodeURIComponent(releaseGroupMbid)}`,
      {
        inc: 'releases',
        fmt: 'json',
      },
    );
    const response = await this.fetchJson<{ releases?: any[] }>(url);

    return Array.isArray(response?.releases) ? response.releases : [];
  }

  private sortCandidateReleases(releases: any[]) {
    return releases
      .filter((release) => typeof release?.id === 'string' && release.id)
      .sort((left, right) => {
        const leftOfficial = left?.status === 'Official' ? 0 : 1;
        const rightOfficial = right?.status === 'Official' ? 0 : 1;
        if (leftOfficial !== rightOfficial) {
          return leftOfficial - rightOfficial;
        }

        const leftDate =
          typeof left?.date === 'string' && left.date ? left.date : '9999';
        const rightDate =
          typeof right?.date === 'string' && right.date ? right.date : '9999';

        return leftDate.localeCompare(rightDate);
      });
  }

  private normalizeComparableText(value: string | null | undefined) {
    return (value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private releaseYearFromDate(value: string | null | undefined) {
    return typeof value === 'string' && value.length >= 4
      ? Number.parseInt(value.slice(0, 4), 10)
      : null;
  }

  private getAlbumSearchRank(
    album: NormalizedAlbumSearchResult,
    query: string,
    originalIndex: number,
  ) {
    const titleKey = this.normalizeComparableText(album.title || album.name);
    const queryKey = this.normalizeComparableText(query);
    const hasCover = Boolean(album.coverUrl);
    let titleScore = 0;

    if (queryKey && titleKey === queryKey) {
      titleScore = 4;
    } else if (queryKey && titleKey.startsWith(`${queryKey} `)) {
      titleScore = 3;
    } else if (queryKey && titleKey.startsWith(queryKey)) {
      titleScore = 2;
    } else if (queryKey && titleKey.includes(queryKey)) {
      titleScore = 1;
    }

    return {
      titleScore,
      coverScore: hasCover ? 1 : 0,
      originalIndex,
    };
  }

  private rankAlbumSearchResults(
    albums: NormalizedAlbumSearchResult[],
    query: string,
  ) {
    return albums
      .map((album, index) => ({
        album,
        rank: this.getAlbumSearchRank(album, query, index),
      }))
      .sort((left, right) => {
        if (left.rank.titleScore !== right.rank.titleScore) {
          return right.rank.titleScore - left.rank.titleScore;
        }

        if (left.rank.coverScore !== right.rank.coverScore) {
          return right.rank.coverScore - left.rank.coverScore;
        }

        return left.rank.originalIndex - right.rank.originalIndex;
      })
      .map(({ album }) => album);
  }

  private appleAlbumMatches(
    album: any,
    title: string,
    artistName: string,
    releaseYear: string | null,
  ) {
    const titleKey = this.normalizeComparableText(title);
    const candidateTitleKey = this.normalizeComparableText(album?.title);
    const artistKey = this.normalizeComparableText(artistName);
    const candidateArtistKey = this.normalizeComparableText(album?.artistName);

    if (!titleKey || !candidateTitleKey || titleKey !== candidateTitleKey) {
      return false;
    }

    if (
      artistKey &&
      candidateArtistKey &&
      !candidateArtistKey.includes(artistKey) &&
      !artistKey.includes(candidateArtistKey)
    ) {
      return false;
    }

    const expectedYear = this.releaseYearFromDate(releaseYear);
    const candidateYear = this.releaseYearFromDate(album?.releaseDate);
    if (
      expectedYear !== null &&
      candidateYear !== null &&
      Math.abs(expectedYear - candidateYear) > 1
    ) {
      return false;
    }

    return typeof album?.coverUrl === 'string' && album.coverUrl.trim();
  }

  private async fetchAppleMusicCoverArt(
    title: string,
    artistName: string,
    releaseYear: string | null,
  ): Promise<ResolvedCoverArt | null> {
    if (!this.appleMusicService) {
      return null;
    }

    try {
      const response = await this.appleMusicService.searchAlbums(
        `${title} ${artistName}`.trim(),
        5,
      );
      const items = Array.isArray((response as any)?.items)
        ? (response as any).items
        : [];
      const matchedAlbum = items.find((album) =>
        this.appleAlbumMatches(album, title, artistName, releaseYear),
      );

      if (!matchedAlbum?.coverUrl) {
        return null;
      }

      return {
        url: matchedAlbum.coverUrl,
        source: 'apple_music',
        provider: 'apple_music',
        attribution: 'Artwork provided by Apple Music',
        appleMusicAlbumId: matchedAlbum.id || null,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          provider: 'apple_music',
          fallbackFor: 'cover_art',
          error:
            (error as Error)?.message ||
            'Apple Music cover art fallback failed',
        }),
      );
      return null;
    }
  }

  private async resolveCoverArt(
    releaseGroup: any,
  ): Promise<ResolvedCoverArt | null> {
    const releaseGroupMbid =
      typeof releaseGroup?.id === 'string' ? releaseGroup.id : null;
    if (!releaseGroupMbid) {
      return null;
    }

    const cacheKey = `resolved:${releaseGroupMbid}`;
    const cached = this.getCached(this.resolvedCoverArtCache, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const releaseGroupCoverUrl = await this.fetchCoverArtArchiveUrl(
      'release-group',
      releaseGroupMbid,
    );
    if (releaseGroupCoverUrl) {
      const resolvedCoverArt: ResolvedCoverArt = {
        url: releaseGroupCoverUrl,
        source: 'cover_art_archive_release_group',
        provider: 'cover_art_archive',
        attribution: 'Cover art from Cover Art Archive',
        musicbrainzReleaseId: null,
      };
      this.setCached(this.resolvedCoverArtCache, cacheKey, resolvedCoverArt);
      return resolvedCoverArt;
    }

    const releases = await this.fetchReleaseGroupReleases(releaseGroupMbid);
    const candidateReleases = this.sortCandidateReleases(releases).slice(0, 6);
    for (const release of candidateReleases) {
      const releaseCoverUrl = await this.fetchCoverArtArchiveUrl(
        'release',
        release.id,
      );

      if (releaseCoverUrl) {
        const resolvedCoverArt: ResolvedCoverArt = {
          url: releaseCoverUrl,
          source: 'cover_art_archive_release',
          provider: 'cover_art_archive',
          attribution: 'Cover art from Cover Art Archive',
          musicbrainzReleaseId: release.id,
        };
        this.setCached(this.resolvedCoverArtCache, cacheKey, resolvedCoverArt);
        return resolvedCoverArt;
      }
    }

    const fanartCoverArt = await this.fetchFanartAlbumCover(releaseGroupMbid);
    if (fanartCoverArt) {
      this.setCached(this.resolvedCoverArtCache, cacheKey, fanartCoverArt);
      return fanartCoverArt;
    }

    const artist = this.getReleaseGroupArtist(releaseGroup);
    const title = releaseGroup?.title || 'Untitled Album';
    const firstReleaseDate =
      typeof releaseGroup?.['first-release-date'] === 'string'
        ? releaseGroup['first-release-date']
        : null;
    const appleCoverArt = await this.fetchAppleMusicCoverArt(
      title,
      artist.name,
      firstReleaseDate,
    );

    this.setCached(this.resolvedCoverArtCache, cacheKey, appleCoverArt);
    return appleCoverArt;
  }

  private async resolveReleaseGroupCoverArtOnly(
    releaseGroupMbid: string,
  ): Promise<ResolvedCoverArt | null> {
    const normalizedReleaseGroupMbid = releaseGroupMbid?.trim();
    if (!normalizedReleaseGroupMbid) {
      return null;
    }

    const cacheKey = `release-group-only:${normalizedReleaseGroupMbid}`;
    const cached = this.getCached(this.resolvedCoverArtCache, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const releaseGroupCoverUrl = await this.fetchCoverArtArchiveUrl(
      'release-group',
      normalizedReleaseGroupMbid,
    );
    const resolvedCoverArt: ResolvedCoverArt | null = releaseGroupCoverUrl
      ? {
          url: releaseGroupCoverUrl,
          source: 'cover_art_archive_release_group',
          provider: 'cover_art_archive',
          attribution: 'Cover art from Cover Art Archive',
          musicbrainzReleaseId: null,
        }
      : null;

    this.setCached(this.resolvedCoverArtCache, cacheKey, resolvedCoverArt);
    return resolvedCoverArt;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await mapper(
            items[currentIndex],
            currentIndex,
          );
        }
      }),
    );

    return results;
  }

  private createEmptyPersonnelResponse(
    releaseGroupMbid: string,
    releaseMbid: string | null = null,
  ): AlbumPersonnelResponse {
    return {
      releaseGroupMbid,
      releaseMbid,
      source: 'musicbrainz',
      personnel: [],
    };
  }

  private createEmptyTracksResponse(
    releaseGroupMbid: string,
    releaseMbid: string | null = null,
  ): AlbumTracksResponse {
    return {
      releaseGroupMbid,
      releaseMbid,
      source: 'musicbrainz',
      tracks: [],
    };
  }

  private createEmptyOtherAlbumsResponse(
    releaseGroupMbid: string,
    artistMbid: string | null = null,
    artistName: string | null = null,
  ): OtherAlbumsResponse {
    return {
      releaseGroupMbid,
      artistMbid,
      artistName,
      source: 'musicbrainz',
      albums: [],
    };
  }

  private createEmptyArtistImageResponse(
    releaseGroupMbid: string,
    artistMbid: string | null = null,
    artistName: string | null = null,
  ): AlbumArtistImageResponse {
    return {
      releaseGroupMbid,
      artistMbid,
      artistName,
      imageUrl: null,
      source: 'fanart_tv',
      imageType: null,
      attributionText: null,
    };
  }

  private async browseReleaseGroupReleases(releaseGroupMbid: string) {
    const url = this.buildMusicBrainzUrl('/release', {
      'release-group': releaseGroupMbid,
      fmt: 'json',
      limit: 25,
      inc: 'artist-credits+media+recordings+labels+release-groups',
    });
    const response = await this.fetchJson<{ releases?: any[] }>(
      url,
      this.personnelRequestTimeoutMs,
    );

    return Array.isArray(response?.releases) ? response.releases : [];
  }

  private async fetchReleaseWithTracks(releaseMbid: string) {
    const url = this.buildMusicBrainzUrl(
      `/release/${encodeURIComponent(releaseMbid)}`,
      {
        fmt: 'json',
        inc: 'artist-credits+labels+media+recordings',
      },
    );

    return this.fetchJson<any>(url, this.personnelRequestTimeoutMs);
  }

  private async fetchReleaseGroupDetails(releaseGroupMbid: string) {
    const url = this.buildMusicBrainzUrl(
      `/release-group/${encodeURIComponent(releaseGroupMbid)}`,
      {
        fmt: 'json',
        inc: 'artist-credits+releases',
      },
    );

    return this.fetchJson<any>(url, this.personnelRequestTimeoutMs);
  }

  private async fetchArtistAlbumReleaseGroups(
    artistMbid: string,
    maxReleaseGroups = this.maxArtistCatalogLimit,
  ) {
    const fetchPagedReleaseGroups = async (
      buildQuery: (
        offset: number,
        limit: number,
      ) => Record<string, string | number>,
    ) => {
      const releaseGroups: any[] = [];

      while (releaseGroups.length < maxReleaseGroups) {
        const limit = Math.min(
          this.artistCatalogPageSize,
          maxReleaseGroups - releaseGroups.length,
        );
        const offset = releaseGroups.length;
        const url = this.buildMusicBrainzUrl('/release-group', {
          ...buildQuery(offset, limit),
          fmt: 'json',
          limit,
          offset: offset > 0 ? offset : undefined,
          inc: 'artist-credits',
        });
        const response = await this.fetchJson<{ 'release-groups'?: any[] }>(
          url,
          this.personnelRequestTimeoutMs,
        );
        const page = Array.isArray(response?.['release-groups'])
          ? response['release-groups']
          : [];

        releaseGroups.push(...page);

        if (page.length < limit) {
          break;
        }
      }

      return releaseGroups;
    };

    const browseReleaseGroups = await fetchPagedReleaseGroups(() => ({
      artist: artistMbid,
      type: 'album',
    }));

    if (browseReleaseGroups.length > 0) {
      return browseReleaseGroups;
    }

    return fetchPagedReleaseGroups(() => ({
      query: `arid:${artistMbid} AND primarytype:"album"`,
    }));
  }

  private async fetchArtistDetails(artistMbid: string) {
    const url = this.buildMusicBrainzUrl(
      `/artist/${encodeURIComponent(artistMbid)}`,
      {
        fmt: 'json',
        inc: 'url-rels+annotation+genres+tags',
      },
    );

    return this.fetchJson<any>(url, this.personnelRequestTimeoutMs);
  }

  private extractWikipediaTitle(resourceUrl: string | null | undefined) {
    if (typeof resourceUrl !== 'string' || !resourceUrl.includes('/wiki/')) {
      return null;
    }

    const title = resourceUrl.split('/wiki/')[1]?.split(/[?#]/)[0];
    return title ? decodeURIComponent(title) : null;
  }

  private getWikipediaRelationResource(relations: any) {
    if (!Array.isArray(relations)) {
      return null;
    }

    const relation = relations.find((candidate) => {
      const relationType =
        typeof candidate?.type === 'string' ? candidate.type.toLowerCase() : '';
      const resource =
        typeof candidate?.url?.resource === 'string'
          ? candidate.url.resource
          : '';

      return (
        relationType === 'wikipedia' || resource.includes('wikipedia.org/wiki/')
      );
    });

    return typeof relation?.url?.resource === 'string'
      ? relation.url.resource
      : null;
  }

  private async fetchWikipediaSummary(resourceUrl: string | null) {
    const title = this.extractWikipediaTitle(resourceUrl);
    if (!title) {
      return null;
    }

    const url = new URL(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title,
      )}`,
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.fanartRequestTimeoutMs,
    );
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'b.sides/1.0 (support@bsides.pro)',
        },
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            provider: 'wikipedia',
            feature: 'artist_profile_description',
            endpoint: url.pathname,
            durationMs,
            status: response.status,
          }),
        );
        return null;
      }

      const data = await response.json();
      const extract =
        typeof data?.extract === 'string' && data.extract.trim()
          ? data.extract.trim()
          : null;

      this.logger.log(
        JSON.stringify({
          provider: 'wikipedia',
          feature: 'artist_profile_description',
          endpoint: url.pathname,
          durationMs,
          status: response.status,
          found: Boolean(extract),
        }),
      );

      return extract;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = (error as Error)?.name === 'AbortError';
      this.logger.warn(
        JSON.stringify({
          provider: 'wikipedia',
          feature: 'artist_profile_description',
          endpoint: url.pathname,
          durationMs,
          timeout: isTimeout,
          error: isTimeout
            ? 'Wikipedia summary request timed out'
            : (error as Error)?.message || 'Wikipedia summary request failed',
        }),
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getArtistDescription(metadata: any) {
    const wikipediaResource = this.getWikipediaRelationResource(
      metadata?.relations,
    );
    const wikipediaSummary =
      await this.fetchWikipediaSummary(wikipediaResource);
    if (wikipediaSummary) {
      return {
        description: wikipediaSummary,
        source: 'MusicBrainz-linked Wikipedia',
      };
    }

    const annotation =
      typeof metadata?.annotation === 'string' && metadata.annotation.trim()
        ? metadata.annotation.trim()
        : null;
    if (annotation) {
      return {
        description: annotation,
        source: 'MusicBrainz annotation',
      };
    }

    const disambiguation =
      typeof metadata?.disambiguation === 'string' &&
      metadata.disambiguation.trim()
        ? metadata.disambiguation.trim()
        : null;
    if (disambiguation) {
      return {
        description: disambiguation,
        source: 'MusicBrainz artist',
      };
    }

    return {
      description: null,
      source: null,
    };
  }

  private getArtistGenreLabels(metadata: any) {
    const genres = Array.isArray(metadata?.genres) ? metadata.genres : [];
    const tags = Array.isArray(metadata?.tags) ? metadata.tags : [];

    return [...genres, ...tags]
      .sort((left, right) => {
        const leftCount = typeof left?.count === 'number' ? left.count : 0;
        const rightCount = typeof right?.count === 'number' ? right.count : 0;
        return rightCount - leftCount;
      })
      .map((genre) => genre?.name)
      .filter((name): name is string => typeof name === 'string' && !!name)
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(0, 8);
  }

  private getReleaseMediaFormats(release: any) {
    const media = Array.isArray(release?.media) ? release.media : [];

    return media
      .map((medium) =>
        typeof medium?.format === 'string' ? medium.format.toLowerCase() : '',
      )
      .filter(Boolean);
  }

  private releaseHasTracks(release: any) {
    const media = Array.isArray(release?.media) ? release.media : [];

    return media.some(
      (medium) => Array.isArray(medium?.tracks) && medium.tracks.length > 0,
    );
  }

  private releaseHasRecordings(release: any) {
    const media = Array.isArray(release?.media) ? release.media : [];

    return media.some((medium) =>
      Array.isArray(medium?.tracks)
        ? medium.tracks.some((track) => Boolean(track?.recording?.id))
        : false,
    );
  }

  private releaseHasPreferredFormat(release: any) {
    const formats = this.getReleaseMediaFormats(release);

    return formats.some(
      (format) => format.includes('digital media') || format === 'cd',
    );
  }

  private releaseHasPreferredCountry(release: any) {
    const country =
      typeof release?.country === 'string' ? release.country.toUpperCase() : '';

    return country === 'US' || country === 'XW';
  }

  private getReleaseSelectionRank(release: any, originalIndex: number) {
    const date =
      typeof release?.date === 'string' && release.date ? release.date : '9999';

    return {
      official: release?.status === 'Official' ? 1 : 0,
      tracks: this.releaseHasTracks(release) ? 1 : 0,
      recordings: this.releaseHasRecordings(release) ? 1 : 0,
      preferredFormat: this.releaseHasPreferredFormat(release) ? 1 : 0,
      preferredCountry: this.releaseHasPreferredCountry(release) ? 1 : 0,
      date,
      originalIndex,
    };
  }

  private selectRepresentativeRelease(releases: any[]) {
    const usableReleases = releases.filter(
      (release) => typeof release?.id === 'string' && release.id,
    );

    if (usableReleases.length === 0) {
      return null;
    }

    return usableReleases
      .map((release, index) => ({
        release,
        rank: this.getReleaseSelectionRank(release, index),
      }))
      .sort((left, right) => {
        const scoreFields = [
          'official',
          'tracks',
          'recordings',
          'preferredFormat',
          'preferredCountry',
        ] as const;

        for (const field of scoreFields) {
          if (left.rank[field] !== right.rank[field]) {
            return right.rank[field] - left.rank[field];
          }
        }

        const dateComparison = left.rank.date.localeCompare(right.rank.date);
        if (dateComparison !== 0) {
          return dateComparison;
        }

        return left.rank.originalIndex - right.rank.originalIndex;
      })[0].release;
  }

  private async fetchReleaseWithPersonnelRelations(releaseMbid: string) {
    const url = this.buildMusicBrainzUrl(
      `/release/${encodeURIComponent(releaseMbid)}`,
      {
        fmt: 'json',
        inc: 'artist-credits+labels+media+recordings+artist-rels+recording-level-rels+work-rels+work-level-rels',
      },
    );

    return this.fetchJson<any>(url, this.personnelRequestTimeoutMs);
  }

  private normalizeRole(value: string | null | undefined) {
    return typeof value === 'string'
      ? value.trim().toLowerCase().replace(/\s+/g, ' ')
      : '';
  }

  private getRelationRole(relation: any) {
    return this.normalizeRole(
      relation?.type ||
        relation?.['type-id'] ||
        relation?.attribute ||
        relation?.attributes?.[0],
    );
  }

  private getRelationArtist(relation: any) {
    const artist = relation?.artist;
    if (!artist || typeof artist?.name !== 'string' || !artist.name.trim()) {
      return null;
    }

    return {
      id: typeof artist?.id === 'string' ? artist.id : null,
      name: artist.name.trim(),
    };
  }

  private normalizePersonnelKey(name: string) {
    return name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private getOrCreatePersonnelPerson(
    personnelByKey: Map<string, MutablePersonnelPerson>,
    artist: { id: string | null; name: string },
  ) {
    const key = artist.id || this.normalizePersonnelKey(artist.name);
    let person = personnelByKey.get(key);

    if (!person) {
      person = {
        name: artist.name,
        musicbrainzArtistId: artist.id,
        roles: new Set(),
        albumLevelRoles: new Set(),
        tracks: new Map(),
      };
      personnelByKey.set(key, person);
    } else if (!person.musicbrainzArtistId && artist.id) {
      person.musicbrainzArtistId = artist.id;
    }

    return person;
  }

  private addPersonnelCredit(
    personnelByKey: Map<string, MutablePersonnelPerson>,
    relation: any,
    track?: { title: string; position: string | null },
  ) {
    const artist = this.getRelationArtist(relation);
    const role = this.getRelationRole(relation);

    if (!artist || !role) {
      return;
    }

    const person = this.getOrCreatePersonnelPerson(personnelByKey, artist);
    person.roles.add(role);

    if (!track) {
      person.albumLevelRoles.add(role);
      return;
    }

    const trackKey = `${track.position || ''}:${track.title}`;
    const trackCredit = person.tracks.get(trackKey) || {
      title: track.title,
      position: track.position,
      roles: new Set<string>(),
    };
    trackCredit.roles.add(role);
    person.tracks.set(trackKey, trackCredit);
  }

  private getTrackPosition(track: any, medium: any, fallbackIndex: number) {
    if (typeof track?.number === 'string' && track.number.trim()) {
      return track.number.trim();
    }

    if (typeof track?.position === 'number') {
      return String(track.position);
    }

    const mediumPosition =
      typeof medium?.position === 'number' ? `${medium.position}.` : '';

    return `${mediumPosition}${fallbackIndex + 1}`;
  }

  private getArtistCreditName(artistCredit: any, fallback = 'Unknown Artist') {
    if (!Array.isArray(artistCredit) || artistCredit.length === 0) {
      return fallback;
    }

    const names = artistCredit
      .map((credit) => credit?.name || credit?.artist?.name)
      .filter((name) => typeof name === 'string' && name.trim());

    return names.length > 0 ? names.join(', ') : fallback;
  }

  private getPrimaryArtistFromCredits(artistCredit: any) {
    const firstCredit = Array.isArray(artistCredit)
      ? artistCredit.find((credit) => credit?.artist)
      : null;
    const artist = firstCredit?.artist || null;
    const name = firstCredit?.name || artist?.name || null;

    return {
      id: typeof artist?.id === 'string' ? artist.id : null,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
    };
  }

  private normalizeReleaseTracks(release: any): AlbumTrack[] {
    const albumArtistName = this.getArtistCreditName(
      release?.['artist-credit'],
    );
    const media = Array.isArray(release?.media) ? release.media : [];

    return media.flatMap((medium) => {
      const tracks = Array.isArray(medium?.tracks) ? medium.tracks : [];
      const discNumber =
        typeof medium?.position === 'number' ? medium.position : null;

      return tracks.map((track, trackIndex) => {
        const recording = track?.recording || {};
        const title =
          typeof track?.title === 'string' && track.title.trim()
            ? track.title.trim()
            : typeof recording?.title === 'string' && recording.title.trim()
              ? recording.title.trim()
              : `Track ${trackIndex + 1}`;
        const position = this.getTrackPosition(track, medium, trackIndex);
        const trackArtistName = this.getArtistCreditName(
          track?.['artist-credit'] || recording?.['artist-credit'],
          albumArtistName,
        );

        return {
          position,
          number:
            typeof track?.number === 'string' && track.number.trim()
              ? track.number.trim()
              : position,
          discNumber,
          title,
          lengthMs:
            typeof track?.length === 'number'
              ? track.length
              : typeof recording?.length === 'number'
                ? recording.length
                : null,
          recordingMbid:
            typeof recording?.id === 'string' ? recording.id : null,
          artistName: trackArtistName,
        };
      });
    });
  }

  private normalizeOtherAlbumReleaseGroup(
    releaseGroup: any,
    fallbackArtist: { id: string | null; name: string | null },
    coverArt: ResolvedCoverArt | null = null,
  ): OtherAlbum | null {
    if (!this.isAlbumReleaseGroup(releaseGroup) || !releaseGroup?.id) {
      return null;
    }

    const artist = this.getReleaseGroupArtist(releaseGroup);
    const artistName = artist.name || fallbackArtist.name || 'Unknown Artist';
    const firstReleaseDate =
      typeof releaseGroup?.['first-release-date'] === 'string' &&
      releaseGroup['first-release-date'].trim()
        ? releaseGroup['first-release-date']
        : null;
    const releaseYear =
      firstReleaseDate && firstReleaseDate.length >= 4
        ? Number.parseInt(firstReleaseDate.slice(0, 4), 10)
        : null;
    const secondaryTypes = Array.isArray(releaseGroup?.['secondary-types'])
      ? releaseGroup['secondary-types'].filter(
          (secondaryType) => typeof secondaryType === 'string',
        )
      : [];
    const title = releaseGroup?.title || 'Untitled Album';
    const coverArtUrl = coverArt?.url || null;

    return {
      id: releaseGroup.id,
      musicbrainzReleaseGroupId: releaseGroup.id,
      title,
      name: title,
      artistName,
      artists: [{ id: artist.id || fallbackArtist.id, name: artistName }],
      firstReleaseDate,
      release_date: firstReleaseDate,
      releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
      primaryType:
        typeof releaseGroup?.['primary-type'] === 'string'
          ? releaseGroup['primary-type']
          : null,
      secondaryTypes,
      coverArtUrl,
      coverUrl: coverArtUrl,
      coverArtSource: coverArt?.source || null,
      coverArtProvider: coverArt?.provider || null,
      coverArtAttribution: coverArt?.attribution || null,
      images: coverArtUrl ? [{ url: coverArtUrl }] : [],
      source: 'musicbrainz',
      sourceProvider: 'musicbrainz',
    };
  }

  private addRelationListCredits(
    personnelByKey: Map<string, MutablePersonnelPerson>,
    relations: any,
    track?: { title: string; position: string | null },
  ) {
    if (!Array.isArray(relations)) {
      return;
    }

    relations.forEach((relation) => {
      this.addPersonnelCredit(personnelByKey, relation, track);

      if (Array.isArray(relation?.work?.relations)) {
        relation.work.relations.forEach((workRelation) =>
          this.addPersonnelCredit(personnelByKey, workRelation, track),
        );
      }
    });
  }

  private normalizePersonnel(
    personnelByKey: Map<string, MutablePersonnelPerson>,
  ) {
    return Array.from(personnelByKey.values())
      .map((person) => ({
        name: person.name,
        musicbrainzArtistId: person.musicbrainzArtistId,
        roles: Array.from(person.roles).sort(),
        albumLevelRoles: Array.from(person.albumLevelRoles).sort(),
        tracks: Array.from(person.tracks.values())
          .map((track) => ({
            title: track.title,
            position: track.position,
            roles: Array.from(track.roles).sort(),
          }))
          .sort((left, right) => {
            const leftPosition = Number.parseFloat(left.position || '');
            const rightPosition = Number.parseFloat(right.position || '');

            if (
              Number.isFinite(leftPosition) &&
              Number.isFinite(rightPosition) &&
              leftPosition !== rightPosition
            ) {
              return leftPosition - rightPosition;
            }

            return (left.position || left.title).localeCompare(
              right.position || right.title,
            );
          }),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private buildPersonnelFromRelease(release: any) {
    const personnelByKey = new Map<string, MutablePersonnelPerson>();

    this.addRelationListCredits(personnelByKey, release?.relations);

    const media = Array.isArray(release?.media) ? release.media : [];
    media.forEach((medium) => {
      const tracks = Array.isArray(medium?.tracks) ? medium.tracks : [];

      tracks.forEach((track, trackIndex) => {
        const title =
          typeof track?.title === 'string' && track.title.trim()
            ? track.title.trim()
            : typeof track?.recording?.title === 'string'
              ? track.recording.title
              : `Track ${trackIndex + 1}`;
        const trackContext = {
          title,
          position: this.getTrackPosition(track, medium, trackIndex),
        };

        this.addRelationListCredits(
          personnelByKey,
          track?.recording?.relations,
          trackContext,
        );
      });
    });

    return this.normalizePersonnel(personnelByKey);
  }

  private getReleaseGroupArtist(releaseGroup: any) {
    const firstCredit = Array.isArray(releaseGroup?.['artist-credit'])
      ? releaseGroup['artist-credit'].find((credit) => credit?.artist)
      : null;
    const artist = firstCredit?.artist || null;
    const artistName =
      firstCredit?.name ||
      artist?.name ||
      releaseGroup?.artist ||
      'Unknown Artist';

    return {
      id: typeof artist?.id === 'string' ? artist.id : null,
      name: artistName,
    };
  }

  private normalizeReleaseGroup(
    releaseGroup: any,
    coverArt: ResolvedCoverArt | null,
  ): NormalizedAlbumSearchResult | null {
    if (!this.isAlbumReleaseGroup(releaseGroup) || !releaseGroup?.id) {
      return null;
    }

    const artist = this.getReleaseGroupArtist(releaseGroup);
    const firstReleaseDate =
      typeof releaseGroup?.['first-release-date'] === 'string'
        ? releaseGroup['first-release-date']
        : null;
    const releaseYear =
      firstReleaseDate && firstReleaseDate.length >= 4
        ? firstReleaseDate.slice(0, 4)
        : null;
    const secondaryTypes = Array.isArray(releaseGroup?.['secondary-types'])
      ? releaseGroup['secondary-types'].filter(
          (secondaryType) => typeof secondaryType === 'string',
        )
      : [];
    const coverArtUrl = coverArt?.url || null;

    return {
      id: releaseGroup.id,
      name: releaseGroup?.title || 'Untitled Album',
      title: releaseGroup?.title || 'Untitled Album',
      artists: [{ id: artist.id, name: artist.name }],
      artistName: artist.name,
      release_date: firstReleaseDate,
      releaseYear,
      firstReleaseDate,
      album_type: 'album',
      images: coverArtUrl ? [{ url: coverArtUrl }] : [],
      coverUrl: coverArtUrl,
      coverArtUrl,
      coverArtSource: coverArt?.source || null,
      coverArtProvider: coverArt?.provider || null,
      coverArtAttribution: coverArt?.attribution || null,
      musicbrainzReleaseGroupId: releaseGroup.id,
      musicbrainzArtistId: artist.id,
      primaryType: releaseGroup['primary-type'],
      secondaryTypes,
      source: 'musicbrainz',
      sourceProvider: 'musicbrainz',
    };
  }

  private normalizeArtist(
    artist: any,
    image: ArtistSearchImageResult | null = null,
  ): NormalizedArtistSearchResult | null {
    if (!artist?.id || !artist?.name) {
      return null;
    }

    const lifeSpan = artist?.['life-span'] || {};
    const imageUrl = image?.imageUrl || null;

    return {
      id: artist.id,
      name: artist.name,
      sortName:
        typeof artist?.['sort-name'] === 'string' ? artist['sort-name'] : null,
      musicbrainzArtistId: artist.id,
      type: typeof artist?.type === 'string' ? artist.type : null,
      country: typeof artist?.country === 'string' ? artist.country : null,
      disambiguation:
        typeof artist?.disambiguation === 'string'
          ? artist.disambiguation
          : null,
      lifeSpan: {
        begin:
          typeof lifeSpan?.begin === 'string' && lifeSpan.begin.trim()
            ? lifeSpan.begin.trim()
            : null,
        end:
          typeof lifeSpan?.end === 'string' && lifeSpan.end.trim()
            ? lifeSpan.end.trim()
            : null,
        ended: typeof lifeSpan?.ended === 'boolean' ? lifeSpan.ended : null,
      },
      imageUrl,
      imageSource: image?.imageSource || null,
      imageType: image?.imageType || null,
      images: imageUrl ? [{ url: imageUrl }] : [],
      genres: [],
      source: 'musicbrainz',
      sourceProvider: 'musicbrainz',
    };
  }

  async searchAlbums(query: string, limit = 20, offset = 0) {
    const normalizedQuery = this.normalizeSearchQuery(query);
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedOffset = this.normalizeOffset(offset);
    const url = this.buildMusicBrainzUrl('/release-group', {
      query: `releasegroup:"${this.escapeLucenePhrase(
        normalizedQuery,
      )}" AND primarytype:"album"`,
      fmt: 'json',
      limit: normalizedLimit,
      offset: normalizedOffset > 0 ? normalizedOffset : undefined,
    });

    return this.unavailableIfMusicBrainzFails(async () => {
      const response = await this.fetchJson<{ 'release-groups'?: any[] }>(url);
      const releaseGroups = Array.isArray(response?.['release-groups'])
        ? response['release-groups'].filter((releaseGroup) =>
            this.isAlbumReleaseGroup(releaseGroup),
          )
        : [];
      const coverArtResults = await Promise.all(
        releaseGroups.map((releaseGroup) =>
          releaseGroup?.id ? this.resolveCoverArt(releaseGroup) : null,
        ),
      );

      const albums = releaseGroups
        .map((releaseGroup, index) =>
          this.normalizeReleaseGroup(
            releaseGroup,
            coverArtResults[index] || null,
          ),
        )
        .filter(
          (album): album is NormalizedAlbumSearchResult => album !== null,
        );

      return this.rankAlbumSearchResults(albums, normalizedQuery);
    });
  }

  async searchArtists(query: string, limit = 20, offset = 0) {
    const normalizedQuery = this.normalizeSearchQuery(query);
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedOffset = this.normalizeOffset(offset);
    const url = this.buildMusicBrainzUrl('/artist', {
      query: `artist:"${this.escapeLucenePhrase(normalizedQuery)}"`,
      fmt: 'json',
      limit: normalizedLimit,
      offset: normalizedOffset > 0 ? normalizedOffset : undefined,
    });

    return this.unavailableIfMusicBrainzFails(async () => {
      const startedAt = Date.now();
      const response = await this.fetchJson<{ artists?: any[] }>(url);
      const artists = Array.isArray(response?.artists) ? response.artists : [];
      const fanartLookupCandidates = artists
        .filter((artist) => typeof artist?.id === 'string' && artist.id)
        .slice(0, this.maxArtistSearchImageLookups);
      const fanartEnabled = Boolean(process.env.FANART_API_KEY?.trim());
      const fanartImageResults = fanartEnabled
        ? await this.mapWithConcurrency(
            fanartLookupCandidates,
            this.artistSearchImageConcurrency,
            async (artist) =>
              this.getFanartArtistSearchImage(
                artist.id,
                typeof artist?.name === 'string' ? artist.name : null,
              ),
          )
        : [];
      const fanartImageByArtistMbid = new Map(
        fanartLookupCandidates.map((artist, index) => [
          artist.id,
          fanartImageResults[index] || null,
        ]),
      );
      const normalizedArtists = artists
        .map((artist) =>
          this.normalizeArtist(
            artist,
            fanartImageByArtistMbid.get(artist?.id) || null,
          ),
        )
        .filter(
          (artist): artist is NormalizedArtistSearchResult => artist !== null,
        );

      this.logger.log(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'artist_search',
          query: normalizedQuery,
          durationMs: Date.now() - startedAt,
          artistCount: normalizedArtists.length,
          fanartLookupCount: fanartLookupCandidates.length,
          fanartImageHitCount: normalizedArtists.filter((artist) =>
            Boolean(artist.imageUrl),
          ).length,
          fanartEnabled,
        }),
      );

      return normalizedArtists;
    });
  }

  async getArtistProfile(
    artistMbid: string,
    limit = 50,
  ): Promise<ArtistProfileResponse> {
    const normalizedArtistMbid = artistMbid?.trim();
    if (!normalizedArtistMbid) {
      throw new BadRequestException('artistMbid is required');
    }

    const normalizedLimit = this.normalizeArtistCatalogLimit(limit);
    const startedAt = Date.now();

    try {
      const metadata = await this.fetchArtistDetails(normalizedArtistMbid);
      const artistName =
        typeof metadata?.name === 'string' && metadata.name.trim()
          ? metadata.name.trim()
          : 'Unknown Artist';
      const [fanartImage, releaseGroups, description] = await Promise.all([
        this.getFanartArtistSearchImage(normalizedArtistMbid, artistName),
        this.fetchArtistAlbumReleaseGroups(
          normalizedArtistMbid,
          normalizedLimit,
        ),
        this.getArtistDescription(metadata),
      ]);
      const artist = this.normalizeArtist(metadata, fanartImage);
      const candidateReleaseGroups = releaseGroups
        .filter((candidate) => this.isAlbumReleaseGroup(candidate))
        .sort((left, right) =>
          (
            (typeof right?.['first-release-date'] === 'string'
              ? right['first-release-date']
              : '') || ''
          ).localeCompare(
            (typeof left?.['first-release-date'] === 'string'
              ? left['first-release-date']
              : '') || '',
          ),
        )
        .slice(0, normalizedLimit);
      const coverArtCandidates = candidateReleaseGroups.slice(
        0,
        this.maxOtherAlbumsCoverArtLookups,
      );
      const coverArtResults = await this.mapWithConcurrency(
        coverArtCandidates,
        this.otherAlbumsCoverArtConcurrency,
        async (candidate) => {
          try {
            return typeof candidate?.id === 'string'
              ? await this.resolveCoverArt(candidate)
              : null;
          } catch (error) {
            this.logger.warn(
              JSON.stringify({
                provider: 'cover_art_archive',
                feature: 'artist_profile_catalog_cover_art',
                artistMbid: normalizedArtistMbid,
                releaseGroupMbid: candidate?.id || null,
                error:
                  (error as Error)?.message ||
                  'Artist catalog cover art lookup failed',
              }),
            );
            return null;
          }
        },
      );
      const coverArtByReleaseGroupMbid = new Map(
        coverArtCandidates.map((candidate, index) => [
          candidate?.id,
          coverArtResults[index] || null,
        ]),
      );
      const catalog = candidateReleaseGroups
        .map((releaseGroup) =>
          this.normalizeOtherAlbumReleaseGroup(
            releaseGroup,
            {
              id: normalizedArtistMbid,
              name: artistName,
            },
            coverArtByReleaseGroupMbid.get(releaseGroup?.id) || null,
          ),
        )
        .filter((album): album is OtherAlbum => album !== null);
      const imageUrl = artist?.imageUrl || fanartImage.imageUrl || null;
      const lifeSpan = artist?.lifeSpan || {
        begin: null,
        end: null,
        ended: null,
      };

      this.logger.log(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'artist_profile',
          artistMbid: normalizedArtistMbid,
          artistName,
          durationMs: Date.now() - startedAt,
          albumCount: catalog.length,
          coverArtCount: catalog.filter((album) => Boolean(album.coverArtUrl))
            .length,
          descriptionFound: Boolean(description.description),
          imageFound: Boolean(imageUrl),
        }),
      );

      return {
        id: normalizedArtistMbid,
        musicbrainzArtistId: normalizedArtistMbid,
        name: artist?.name || artistName,
        sortName: artist?.sortName || null,
        type: artist?.type || null,
        country: artist?.country || null,
        disambiguation: artist?.disambiguation || null,
        lifeSpan,
        description: description.description,
        descriptionSource: description.source,
        imageUrl,
        imageSource: imageUrl ? 'fanart_tv' : null,
        imageType: artist?.imageType || fanartImage.imageType,
        images: imageUrl ? [{ url: imageUrl }] : [],
        genres: this.getArtistGenreLabels(metadata),
        catalog,
        source: 'musicbrainz',
        sourceProvider: 'musicbrainz',
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'artist_profile',
          artistMbid: normalizedArtistMbid,
          durationMs: Date.now() - startedAt,
          error:
            (error as Error)?.message || 'MusicBrainz artist profile failed',
        }),
      );

      return {
        id: normalizedArtistMbid,
        musicbrainzArtistId: normalizedArtistMbid,
        name: 'Unknown Artist',
        sortName: null,
        type: null,
        country: null,
        disambiguation: null,
        lifeSpan: {
          begin: null,
          end: null,
          ended: null,
        },
        description: null,
        descriptionSource: null,
        imageUrl: null,
        imageSource: null,
        imageType: null,
        images: [],
        genres: [],
        catalog: [],
        source: 'musicbrainz',
        sourceProvider: 'musicbrainz',
      };
    }
  }

  getReleaseGroupCoverArt(releaseGroupMbid: string) {
    if (!releaseGroupMbid?.trim()) {
      throw new BadRequestException('releaseGroupMbid is required');
    }

    return this.fetchCoverArtArchiveUrl(
      'release-group',
      releaseGroupMbid.trim(),
    );
  }

  async getAlbumTracks(releaseGroupMbid: string): Promise<AlbumTracksResponse> {
    const normalizedReleaseGroupMbid = releaseGroupMbid?.trim();
    if (!normalizedReleaseGroupMbid) {
      throw new BadRequestException('releaseGroupMbid is required');
    }

    const startedAt = Date.now();
    let selectedReleaseMbid: string | null = null;

    try {
      const releases = await this.browseReleaseGroupReleases(
        normalizedReleaseGroupMbid,
      );
      const selectedRelease = this.selectRepresentativeRelease(releases);
      selectedReleaseMbid =
        typeof selectedRelease?.id === 'string' ? selectedRelease.id : null;

      if (!selectedReleaseMbid) {
        const response = this.createEmptyTracksResponse(
          normalizedReleaseGroupMbid,
        );
        this.logger.log(
          JSON.stringify({
            provider: 'musicbrainz',
            feature: 'album_tracks',
            releaseGroupMbid: normalizedReleaseGroupMbid,
            releaseMbid: null,
            durationMs: Date.now() - startedAt,
            trackCount: 0,
          }),
        );
        return response;
      }

      const release = await this.fetchReleaseWithTracks(selectedReleaseMbid);
      const tracks = this.normalizeReleaseTracks(release);
      const artistName = this.getArtistCreditName(release?.['artist-credit']);

      this.logger.log(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'album_tracks',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          releaseMbid: selectedReleaseMbid,
          durationMs: Date.now() - startedAt,
          trackCount: tracks.length,
        }),
      );

      return {
        releaseGroupMbid: normalizedReleaseGroupMbid,
        releaseMbid: selectedReleaseMbid,
        title: typeof release?.title === 'string' ? release.title : undefined,
        artistName,
        source: 'musicbrainz',
        tracks,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'album_tracks',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          releaseMbid: selectedReleaseMbid,
          durationMs: Date.now() - startedAt,
          error: (error as Error)?.message || 'MusicBrainz track lookup failed',
        }),
      );

      return this.createEmptyTracksResponse(
        normalizedReleaseGroupMbid,
        selectedReleaseMbid,
      );
    }
  }

  async getOtherAlbums(releaseGroupMbid: string): Promise<OtherAlbumsResponse> {
    const normalizedReleaseGroupMbid = releaseGroupMbid?.trim();
    if (!normalizedReleaseGroupMbid) {
      throw new BadRequestException('releaseGroupMbid is required');
    }

    const startedAt = Date.now();
    let artistMbid: string | null = null;
    let artistName: string | null = null;

    try {
      const releaseGroup = await this.fetchReleaseGroupDetails(
        normalizedReleaseGroupMbid,
      );
      const artist = this.getPrimaryArtistFromCredits(
        releaseGroup?.['artist-credit'],
      );
      artistMbid = artist.id;
      artistName = artist.name;

      if (!artistMbid) {
        const response = this.createEmptyOtherAlbumsResponse(
          normalizedReleaseGroupMbid,
          artistMbid,
          artistName,
        );
        this.logger.log(
          JSON.stringify({
            provider: 'musicbrainz',
            feature: 'other_albums',
            releaseGroupMbid: normalizedReleaseGroupMbid,
            artistMbid,
            durationMs: Date.now() - startedAt,
            albumCount: 0,
          }),
        );
        return response;
      }

      const releaseGroups =
        await this.fetchArtistAlbumReleaseGroups(artistMbid);
      const candidateReleaseGroups = releaseGroups
        .filter((candidate) => candidate?.id !== normalizedReleaseGroupMbid)
        .filter((candidate) => this.isAlbumReleaseGroup(candidate))
        .sort((left, right) =>
          (
            (typeof right?.['first-release-date'] === 'string'
              ? right['first-release-date']
              : '') || ''
          ).localeCompare(
            (typeof left?.['first-release-date'] === 'string'
              ? left['first-release-date']
              : '') || '',
          ),
        );
      const coverArtCandidates = candidateReleaseGroups.slice(
        0,
        this.maxOtherAlbumsCoverArtLookups,
      );
      const coverArtResults = await this.mapWithConcurrency(
        coverArtCandidates,
        this.otherAlbumsCoverArtConcurrency,
        async (candidate) => {
          try {
            return typeof candidate?.id === 'string'
              ? await this.resolveCoverArt(candidate)
              : null;
          } catch (error) {
            this.logger.warn(
              JSON.stringify({
                provider: 'cover_art_archive',
                feature: 'other_albums_cover_art',
                releaseGroupMbid: candidate?.id || null,
                error:
                  (error as Error)?.message ||
                  'Other albums cover art lookup failed',
              }),
            );
            return null;
          }
        },
      );
      const coverArtByReleaseGroupMbid = new Map(
        coverArtCandidates.map((candidate, index) => [
          candidate?.id,
          coverArtResults[index] || null,
        ]),
      );
      const albums = candidateReleaseGroups
        .map((candidate) =>
          this.normalizeOtherAlbumReleaseGroup(
            candidate,
            {
              id: artistMbid,
              name: artistName,
            },
            coverArtByReleaseGroupMbid.get(candidate?.id) || null,
          ),
        )
        .filter((album): album is OtherAlbum => album !== null)
        .sort((left, right) =>
          (right.firstReleaseDate || '').localeCompare(
            left.firstReleaseDate || '',
          ),
        );

      this.logger.log(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'other_albums',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          artistMbid,
          durationMs: Date.now() - startedAt,
          albumCount: albums.length,
          coverArtCount: albums.filter((album) => Boolean(album.coverArtUrl))
            .length,
        }),
      );

      return {
        releaseGroupMbid: normalizedReleaseGroupMbid,
        artistMbid,
        artistName,
        source: 'musicbrainz',
        albums,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'other_albums',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          artistMbid,
          durationMs: Date.now() - startedAt,
          error:
            (error as Error)?.message ||
            'MusicBrainz other albums lookup failed',
        }),
      );

      return this.createEmptyOtherAlbumsResponse(
        normalizedReleaseGroupMbid,
        artistMbid,
        artistName,
      );
    }
  }

  async getAlbumArtistImage(
    releaseGroupMbid: string,
  ): Promise<AlbumArtistImageResponse> {
    const normalizedReleaseGroupMbid = releaseGroupMbid?.trim();
    if (!normalizedReleaseGroupMbid) {
      throw new BadRequestException('releaseGroupMbid is required');
    }

    const startedAt = Date.now();
    let artistMbid: string | null = null;
    let artistName: string | null = null;

    try {
      const releaseGroup = await this.fetchReleaseGroupDetails(
        normalizedReleaseGroupMbid,
      );
      const artist = this.getPrimaryArtistFromCredits(
        releaseGroup?.['artist-credit'],
      );
      artistMbid = artist.id;
      artistName = artist.name;

      if (!artistMbid) {
        const response = this.createEmptyArtistImageResponse(
          normalizedReleaseGroupMbid,
          artistMbid,
          artistName,
        );
        this.logger.log(
          JSON.stringify({
            provider: 'fanart_tv',
            feature: 'album_artist_image',
            releaseGroupMbid: normalizedReleaseGroupMbid,
            artistMbid,
            artistName,
            imageFound: false,
            imageType: null,
            durationMs: Date.now() - startedAt,
          }),
        );
        return response;
      }

      const cacheKey = `artist-image:${artistMbid}`;
      const cached = this.getCached(this.artistImageCache, cacheKey);
      if (cached !== undefined) {
        return {
          ...cached,
          releaseGroupMbid: normalizedReleaseGroupMbid,
          artistMbid,
          artistName: artistName || cached.artistName,
        };
      }

      const fanartImage = await this.fetchFanartArtistImage(
        artistMbid,
        artistName,
      );
      const response: AlbumArtistImageResponse = {
        releaseGroupMbid: normalizedReleaseGroupMbid,
        artistMbid,
        artistName,
        imageUrl: fanartImage.imageUrl,
        source: 'fanart_tv',
        imageType: fanartImage.imageType,
        attributionText: fanartImage.attributionText,
      };

      this.setCached(
        this.artistImageCache,
        cacheKey,
        response,
        response.imageUrl
          ? this.artistImageFoundCacheTtlMs
          : this.artistImageMissingCacheTtlMs,
      );
      this.logger.log(
        JSON.stringify({
          provider: 'fanart_tv',
          feature: 'album_artist_image',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          artistMbid,
          artistName,
          imageFound: Boolean(response.imageUrl),
          imageType: response.imageType,
          durationMs: Date.now() - startedAt,
        }),
      );

      return response;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          provider: 'fanart_tv',
          feature: 'album_artist_image',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          artistMbid,
          artistName,
          durationMs: Date.now() - startedAt,
          error:
            (error as Error)?.message || 'Album artist image lookup failed',
        }),
      );

      return this.createEmptyArtistImageResponse(
        normalizedReleaseGroupMbid,
        artistMbid,
        artistName,
      );
    }
  }

  async getAlbumPersonnel(
    releaseGroupMbid: string,
  ): Promise<AlbumPersonnelResponse> {
    const normalizedReleaseGroupMbid = releaseGroupMbid?.trim();
    if (!normalizedReleaseGroupMbid) {
      throw new BadRequestException('releaseGroupMbid is required');
    }

    const startedAt = Date.now();
    let selectedReleaseMbid: string | null = null;

    try {
      const releases = await this.browseReleaseGroupReleases(
        normalizedReleaseGroupMbid,
      );
      const selectedRelease = this.selectRepresentativeRelease(releases);
      selectedReleaseMbid =
        typeof selectedRelease?.id === 'string' ? selectedRelease.id : null;

      if (!selectedReleaseMbid) {
        const response = this.createEmptyPersonnelResponse(
          normalizedReleaseGroupMbid,
        );
        this.logger.log(
          JSON.stringify({
            provider: 'musicbrainz',
            feature: 'album_personnel',
            releaseGroupMbid: normalizedReleaseGroupMbid,
            releaseMbid: null,
            durationMs: Date.now() - startedAt,
            personnelCount: 0,
          }),
        );
        return response;
      }

      const release =
        await this.fetchReleaseWithPersonnelRelations(selectedReleaseMbid);
      const personnel = this.buildPersonnelFromRelease(release);

      this.logger.log(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'album_personnel',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          releaseMbid: selectedReleaseMbid,
          durationMs: Date.now() - startedAt,
          personnelCount: personnel.length,
        }),
      );

      return {
        releaseGroupMbid: normalizedReleaseGroupMbid,
        releaseMbid: selectedReleaseMbid,
        source: 'musicbrainz',
        personnel,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          provider: 'musicbrainz',
          feature: 'album_personnel',
          releaseGroupMbid: normalizedReleaseGroupMbid,
          releaseMbid: selectedReleaseMbid,
          durationMs: Date.now() - startedAt,
          error:
            (error as Error)?.message || 'MusicBrainz personnel lookup failed',
        }),
      );

      return this.createEmptyPersonnelResponse(
        normalizedReleaseGroupMbid,
        selectedReleaseMbid,
      );
    }
  }
}
