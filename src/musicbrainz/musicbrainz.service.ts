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

type CoverArtProvider = 'cover_art_archive' | 'apple_music';

type CoverArtSource =
  | 'cover_art_archive_release'
  | 'cover_art_archive_release_group'
  | 'apple_music'
  | null;

type ResolvedCoverArt = {
  url: string;
  source: Exclude<CoverArtSource, null>;
  provider: CoverArtProvider;
  attribution: string | null;
  musicbrainzReleaseId?: string | null;
  appleMusicAlbumId?: string | null;
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
  private readonly maxQueryLength = 120;
  private readonly requestTimeoutMs = 7000;
  private readonly coverArtTimeoutMs = 2500;
  private readonly cacheTtlMs = 10 * 60 * 1000;
  private readonly coverArtCache = new Map<string, CacheEntry<string | null>>();
  private readonly resolvedCoverArtCache = new Map<
    string,
    CacheEntry<ResolvedCoverArt | null>
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
  ) {
    if (cache.size >= 250) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
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

    return (
      frontImage?.thumbnails?.['500'] ||
      frontImage?.thumbnails?.large ||
      frontImage?.thumbnails?.['250'] ||
      firstAvailableThumbnail ||
      firstImage?.image ||
      null
    );
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

  private normalizeArtist(artist: any): NormalizedArtistSearchResult | null {
    if (!artist?.id || !artist?.name) {
      return null;
    }

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
      images: [],
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

      return releaseGroups
        .map((releaseGroup, index) =>
          this.normalizeReleaseGroup(
            releaseGroup,
            coverArtResults[index] || null,
          ),
        )
        .filter(
          (album): album is NormalizedAlbumSearchResult => album !== null,
        );
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
      const response = await this.fetchJson<{ artists?: any[] }>(url);
      const artists = Array.isArray(response?.artists) ? response.artists : [];

      return artists
        .map((artist) => this.normalizeArtist(artist))
        .filter(
          (artist): artist is NormalizedArtistSearchResult => artist !== null,
        );
    });
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
}
