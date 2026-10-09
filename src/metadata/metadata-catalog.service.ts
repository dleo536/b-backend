import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MetadataAlbumEntity } from './metadata-album.entity';
import { MetadataArtistEntity } from './metadata-artist.entity';

export const isMbid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isSpotifyId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9]{22}$/.test(value);

@Injectable()
export class MetadataCatalogService {
  constructor(
    @InjectRepository(MetadataAlbumEntity)
    readonly albums: Repository<MetadataAlbumEntity>,
    @InjectRepository(MetadataArtistEntity)
    readonly artists: Repository<MetadataArtistEntity>,
  ) {}

  findAlbum(id: string) {
    if (isMbid(id))
      return this.albums.findOne({
        where: [
          { id },
          { musicbrainzReleaseGroupId: id },
          { musicbrainzReleaseId: id },
        ],
      });
    if (isSpotifyId(id))
      return this.albums.findOne({ where: { spotifyAlbumId: id } });
    throw new BadRequestException(
      'Expected a local album UUID, MusicBrainz ID, or Spotify album ID',
    );
  }

  async albumAliases(id: string) {
    const album = await this.findAlbum(id);
    return [
      ...new Set(
        [
          id,
          album?.id,
          album?.musicbrainzReleaseGroupId,
          album?.musicbrainzReleaseId,
          album?.spotifyAlbumId,
        ].filter(Boolean),
      ),
    ] as string[];
  }

  async decorateAlbums(albums: any[]) {
    const ids = albums.map((album) => album.spotifyAlbumId).filter(Boolean);
    if (!ids.length) return albums;
    const stored = await this.albums.find({
      where: { spotifyAlbumId: In(ids) },
    });
    const bySpotifyId = new Map(
      stored.map((album) => [album.spotifyAlbumId, album]),
    );
    return albums.map((album) =>
      this.decorateAlbum(album, bySpotifyId.get(album.spotifyAlbumId)),
    );
  }

  decorateAlbum(album: any, stored?: MetadataAlbumEntity | null) {
    if (!stored) return album;
    return {
      ...album,
      id:
        stored.musicbrainzReleaseGroupId ||
        stored.musicbrainzReleaseId ||
        album.id,
      localAlbumId: stored.id,
      musicbrainzReleaseGroupId:
        stored.musicbrainzReleaseGroupId ||
        album.musicbrainzReleaseGroupId ||
        null,
      releaseGroupMbId:
        stored.musicbrainzReleaseGroupId ||
        album.musicbrainzReleaseGroupId ||
        null,
      musicbrainzReleaseId: stored.musicbrainzReleaseId,
      musicbrainzArtistId: stored.musicbrainzArtistId,
      metadataMatchConfidence: stored.metadataMatchConfidence,
    };
  }

  async decorateArtists(artists: any[]) {
    const ids = artists.map((artist) => artist.spotifyArtistId).filter(Boolean);
    if (!ids.length) return artists;
    const stored = await this.artists.find({
      where: { spotifyArtistId: In(ids) },
    });
    const bySpotifyId = new Map(
      stored.map((artist) => [artist.spotifyArtistId, artist]),
    );
    return artists.map((artist) => {
      const record = bySpotifyId.get(artist.spotifyArtistId);
      return record
        ? {
            ...artist,
            localArtistId: record.id,
            musicbrainzArtistId: record.musicbrainzArtistId,
          }
        : artist;
    });
  }

  async findArtist(id: string) {
    if (isMbid(id))
      return this.artists.findOne({
        where: [{ id }, { musicbrainzArtistId: id }],
      });
    if (isSpotifyId(id))
      return this.artists.findOne({ where: { spotifyArtistId: id } });
    throw new BadRequestException(
      'Expected a local artist UUID, MusicBrainz ID, or Spotify artist ID',
    );
  }

  async ensureReviewIdentity(input: {
    releaseGroupMbId?: string;
    releaseMbId?: string;
    artistMbId?: string;
    spotifyAlbumId?: string;
    albumTitleSnapshot: string;
    artistNameSnapshot: string;
  }) {
    const mbid = input.releaseGroupMbId;
    const spotifyId = input.spotifyAlbumId;
    if (mbid && !isMbid(mbid))
      throw new BadRequestException(
        'releaseGroupMbId must be a MusicBrainz UUID',
      );
    if (spotifyId && !isSpotifyId(spotifyId))
      throw new BadRequestException('spotifyAlbumId must be a Spotify ID');
    if (input.releaseMbId && !isMbid(input.releaseMbId))
      throw new BadRequestException('releaseMbId must be a MusicBrainz UUID');
    if (input.artistMbId && !isMbid(input.artistMbId))
      throw new BadRequestException('artistMbId must be a MusicBrainz UUID');
    if (!mbid && !spotifyId)
      throw new BadRequestException(
        'A MusicBrainz or Spotify album ID is required',
      );
    const existing = await this.findAlbum(mbid || spotifyId!);
    if (existing) {
      if (mbid && spotifyId && existing.spotifyAlbumId !== spotifyId) {
        throw new BadRequestException(
          'Album provider IDs do not match the reviewed catalog mapping',
        );
      }
      if (
        (input.releaseMbId &&
          existing.musicbrainzReleaseId &&
          input.releaseMbId !== existing.musicbrainzReleaseId) ||
        (input.artistMbId &&
          existing.musicbrainzArtistId &&
          input.artistMbId !== existing.musicbrainzArtistId)
      ) {
        throw new BadRequestException(
          'MusicBrainz IDs do not match the reviewed catalog mapping',
        );
      }
      return existing;
    }
    if (mbid && spotifyId)
      throw new BadRequestException(
        'Link provider IDs through a reviewed mapping first',
      );
    const row = this.albums.create({
      musicbrainzReleaseGroupId: mbid || null,
      musicbrainzReleaseId: input.releaseMbId || null,
      musicbrainzArtistId: input.artistMbId || null,
      spotifyAlbumId: spotifyId || null,
      title: input.albumTitleSnapshot,
      artistName: input.artistNameSnapshot,
      metadataProvider: mbid ? 'musicbrainz' : 'spotify',
    });
    try {
      return await this.albums.save(row);
    } catch (error) {
      if (error?.code !== '23505') throw error;
      const concurrent = await this.findAlbum(mbid || spotifyId!);
      if (!concurrent) throw error;
      return concurrent;
    }
  }
}
