import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../review/review.entity';
import { MusicBrainzService } from '../musicbrainz/musicbrainz.service';
import {
  MetadataCatalogService,
  isMbid,
  isSpotifyId,
} from './metadata-catalog.service';
import { MusicBrainzProvider } from './musicbrainz.provider';
import { SpotifyProvider, SPOTIFY_ATTRIBUTION } from './spotify.provider';
import type { MusicMetadataProvider } from './music-metadata-provider';

@Injectable()
export class MusicMetadataService {
  private readonly logger = new Logger(MusicMetadataService.name);
  readonly provider: MusicMetadataProvider;
  constructor(
    private readonly spotify: SpotifyProvider,
    private readonly musicbrainz: MusicBrainzProvider,
    private readonly catalog: MetadataCatalogService,
    private readonly musicbrainzService: MusicBrainzService,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
  ) {
    const configured = (
      process.env.MUSIC_METADATA_PROVIDER ||
      process.env.MUSIC_SEARCH_PROVIDER ||
      'spotify'
    )
      .trim()
      .toLowerCase();
    if (!['spotify', 'musicbrainz'].includes(configured))
      throw new Error('MUSIC_METADATA_PROVIDER must be spotify or musicbrainz');
    this.provider = configured === 'spotify' ? spotify : musicbrainz;
    this.logger.log(`Music metadata provider selected: ${this.provider.name}`);
  }

  async searchAlbums(query: string, limit = 10, offset = 0, market?: string) {
    return this.catalog.decorateAlbums(
      await this.provider.searchAlbums(query, limit, offset, market),
    );
  }
  async searchArtists(query: string, limit = 10, offset = 0) {
    return this.catalog.decorateArtists(
      await this.provider.searchArtists(query, limit, offset),
    );
  }

  private async resolveAlbum(id: string) {
    const stored = await this.catalog.findAlbum(id);
    let providerId =
      this.provider.name === 'spotify'
        ? stored?.spotifyAlbumId || (isSpotifyId(id) ? id : null)
        : stored?.musicbrainzReleaseGroupId ||
          (isMbid(id) && id !== stored?.id ? id : null);
    if (
      this.provider.name === 'musicbrainz' &&
      stored?.musicbrainzReleaseId &&
      !stored.musicbrainzReleaseGroupId
    ) {
      providerId = await this.musicbrainzService.getReleaseGroupIdForRelease(
        stored.musicbrainzReleaseId,
      );
    }
    return { stored, providerId };
  }

  async getAlbumDetails(id: string) {
    const { stored, providerId } = await this.resolveAlbum(id);
    if (!providerId) {
      // An unmapped old review still renders without waking the MusicBrainz VM.
      const review = isMbid(id)
        ? await this.reviews.findOne({
            where: [
              { releaseGroupMbId: id },
              { releaseMbId: id },
              { albumId: id },
            ],
            order: { createdAt: 'ASC' },
          })
        : isSpotifyId(id)
          ? await this.reviews.findOne({
              where: { spotifyAlbumId: id },
              order: { createdAt: 'ASC' },
            })
          : null;
      const title = stored?.title || review?.albumTitleSnapshot;
      if (!title)
        throw new NotFoundException(
          'Album has no mapping for the selected metadata provider. Run map:spotify-albums first.',
        );
      const spotifyAlbumId =
        stored?.spotifyAlbumId || review?.spotifyAlbumId || null;
      const coverUrl =
        stored?.spotifyImageUrl || review?.coverUrlSnapshot || null;
      return {
        ...(stored?.musicbrainzSnapshot || {}),
        id:
          stored?.musicbrainzReleaseGroupId ||
          stored?.musicbrainzReleaseId ||
          id,
        localAlbumId: stored?.id || null,
        name: title,
        title,
        artistName: stored?.artistName || review?.artistNameSnapshot,
        artists: [
          {
            id: null,
            name:
              stored?.artistName ||
              review?.artistNameSnapshot ||
              'Unknown Artist',
          },
        ],
        musicbrainzReleaseGroupId:
          stored?.musicbrainzReleaseGroupId || review?.releaseGroupMbId || null,
        musicbrainzReleaseId:
          stored?.musicbrainzReleaseId || review?.releaseMbId || null,
        musicbrainzArtistId:
          stored?.musicbrainzArtistId || review?.artistMbId || null,
        spotifyAlbumId,
        spotifyArtistId: stored?.spotifyArtistId || null,
        sourceAlbumUrl:
          stored?.spotifyAlbumUrl ||
          (spotifyAlbumId
            ? `https://open.spotify.com/album/${spotifyAlbumId}`
            : null),
        coverArtProvider: stored?.spotifyImageUrl ? 'spotify' : null,
        attributionText: stored?.spotifyImageUrl ? SPOTIFY_ATTRIBUTION : null,
        images: coverUrl ? [{ url: coverUrl }] : [],
        coverUrl,
        source: 'snapshot',
        sourceProvider: 'snapshot',
        metadataUnavailable: true,
        metadataUnavailableReason:
          'No reviewed mapping for the selected provider',
      };
    }
    return this.catalog.decorateAlbum(
      await this.provider.getAlbumDetails(providerId),
      stored,
    );
  }

  private async requireProviderAlbum(id: string) {
    const resolved = await this.resolveAlbum(id);
    if (!resolved.providerId)
      throw new ConflictException(
        'This album needs a reviewed mapping for the selected metadata provider',
      );
    return resolved as typeof resolved & { providerId: string };
  }

  async getAlbumTracks(id: string) {
    const { stored, providerId } = await this.requireProviderAlbum(id);
    return {
      ...(await this.provider.getAlbumTracks(providerId)),
      releaseGroupMbid:
        stored?.musicbrainzReleaseGroupId ||
        (this.provider.name === 'musicbrainz' ? providerId : null),
    };
  }
  async getOtherAlbums(id: string) {
    if (this.provider.name === 'musicbrainz') {
      const { providerId } = await this.requireProviderAlbum(id);
      return this.musicbrainzService.getOtherAlbums(providerId);
    }
    const album = await this.getAlbumDetails(id);
    if (!album.spotifyArtistId) return { albums: [], source: 'spotify' };
    const albums = await this.catalog.decorateAlbums(
      await this.spotify.getArtistAlbums(album.spotifyArtistId),
    );
    return {
      releaseGroupMbid: album.musicbrainzReleaseGroupId || null,
      artistMbid: album.musicbrainzArtistId || null,
      spotifyArtistId: album.spotifyArtistId,
      artistName: album.artists?.[0]?.name,
      albums: albums.filter(
        (item) => item.spotifyAlbumId !== album.spotifyAlbumId,
      ),
      source: 'spotify',
      sourceArtistUrl: album.sourceArtistUrl,
      attributionText: SPOTIFY_ATTRIBUTION,
    };
  }
  async getAlbumArtistImage(id: string) {
    if (this.provider.name === 'musicbrainz') {
      const { providerId } = await this.requireProviderAlbum(id);
      return this.musicbrainzService.getAlbumArtistImage(providerId);
    }
    const album = await this.getAlbumDetails(id);
    const artist = album.spotifyArtistId
      ? await this.spotify.getArtistDetails(album.spotifyArtistId)
      : null;
    return {
      releaseGroupMbid: album.musicbrainzReleaseGroupId || null,
      artistMbid: album.musicbrainzArtistId || null,
      spotifyArtistId: artist?.spotifyArtistId || null,
      artistName: artist?.name || album.artistName,
      imageUrl: artist?.imageUrl || null,
      imageType: 'artist',
      source: 'spotify',
      sourceArtistUrl: artist?.sourceArtistUrl || null,
      attributionText: SPOTIFY_ATTRIBUTION,
    };
  }
  async getAlbumPersonnel(id: string) {
    if (this.provider.name === 'musicbrainz') {
      const { providerId } = await this.requireProviderAlbum(id);
      return this.musicbrainzService.getAlbumPersonnel(providerId);
    }
    return {
      releaseGroupMbid: null,
      releaseMbid: null,
      source: 'spotify',
      personnel: [],
      unavailableReason: 'Spotify does not provide album personnel credits',
    };
  }
  async getCoverArt(id: string) {
    const album = await this.getAlbumDetails(id);
    return { ...album, url: album.coverUrl, coverArtUrl: album.coverUrl };
  }
  async getArtistProfile(id: string) {
    const stored = await this.catalog.findArtist(id);
    const providerId =
      this.provider.name === 'spotify'
        ? stored?.spotifyArtistId || (isSpotifyId(id) ? id : null)
        : stored?.musicbrainzArtistId ||
          (isMbid(id) && id !== stored?.id ? id : null);
    if (!providerId)
      throw new NotFoundException(
        'Artist has no mapping for the selected metadata provider',
      );
    const artist = await this.provider.getArtistDetails(providerId);
    const catalog = await this.catalog.decorateAlbums(
      await this.provider.getArtistAlbums(providerId),
    );
    return {
      ...artist,
      musicbrainzArtistId:
        stored?.musicbrainzArtistId || artist.musicbrainzArtistId || null,
      catalog,
    };
  }
}
