import { Injectable } from '@nestjs/common';
import { SpotifyService } from '../spotify/spotify.service';
import type {
  MetadataAlbum,
  MetadataArtist,
  MusicMetadataProvider,
} from './music-metadata-provider';

export const SPOTIFY_ATTRIBUTION = 'Metadata and artwork from Spotify';

export const normalizeSpotifyArtist = (artist: any): MetadataArtist => ({
  ...artist,
  id: artist.id,
  name: artist.name,
  spotifyArtistId: artist.id,
  spotifyArtistUrl:
    artist.external_urls?.spotify ||
    `https://open.spotify.com/artist/${artist.id}`,
  sourceArtistUrl:
    artist.external_urls?.spotify ||
    `https://open.spotify.com/artist/${artist.id}`,
  musicbrainzArtistId: null,
  imageUrl: artist.images?.[0]?.url || null,
  images: artist.images || [],
  genres: artist.genres || [],
  source: 'spotify',
  sourceProvider: 'spotify',
  attributionText: SPOTIFY_ATTRIBUTION,
});

export const normalizeSpotifyAlbum = (album: any): MetadataAlbum => {
  const artists = (album.artists || []).map(normalizeSpotifyArtist);
  const imageUrl = album.images?.[0]?.url || null;
  const albumUrl =
    album.external_urls?.spotify ||
    `https://open.spotify.com/album/${album.id}`;
  return {
    ...album,
    id: album.id,
    name: album.name,
    title: album.name,
    artists,
    artistName: artists.map((artist: MetadataArtist) => artist.name).join(', '),
    spotifyAlbumId: album.id,
    spotifyArtistId: artists[0]?.spotifyArtistId || null,
    spotifyAlbumUrl: albumUrl,
    spotifyArtistUrl: artists[0]?.sourceArtistUrl || null,
    spotifyImageUrl: imageUrl,
    musicbrainzReleaseGroupId: null,
    musicbrainzReleaseId: null,
    musicbrainzArtistId: null,
    firstReleaseDate: album.release_date || null,
    releaseYear: album.release_date?.slice(0, 4) || null,
    primaryType: album.album_type || 'album',
    secondaryTypes: [],
    images: album.images || [],
    coverUrl: imageUrl,
    coverArtUrl: imageUrl,
    coverArtProvider: 'spotify',
    coverArtSource: 'spotify',
    coverArtAttribution: SPOTIFY_ATTRIBUTION,
    source: 'spotify',
    sourceProvider: 'spotify',
    sourceAlbumUrl: albumUrl,
    sourceArtistUrl: artists[0]?.sourceArtistUrl || null,
    attributionText: SPOTIFY_ATTRIBUTION,
  };
};

@Injectable()
export class SpotifyProvider implements MusicMetadataProvider {
  readonly name = 'spotify' as const;
  constructor(private readonly service: SpotifyService) {}
  async searchAlbums(query: string, limit = 10, offset = 0, market?: string) {
    const result = (await this.service.searchAlbums(
      query,
      limit,
      offset,
      market,
    )) as any;
    return (result.albums?.items || []).map(normalizeSpotifyAlbum);
  }
  async searchArtists(query: string, limit = 10, offset = 0) {
    const result = (await this.service.searchArtists(
      query,
      limit,
      offset,
    )) as any;
    return (result.artists?.items || []).map(normalizeSpotifyArtist);
  }
  async getAlbumDetails(id: string) {
    return normalizeSpotifyAlbum(await this.service.getAlbum(id));
  }
  async getAlbumTracks(id: string) {
    const album = await this.getAlbumDetails(id);
    const tracks = (await this.service.getAlbumTracks(id)) as any[];
    return {
      albumId: album.id,
      spotifyAlbumId: id,
      releaseGroupMbid: null,
      releaseMbid: null,
      title: album.name,
      artistName: album.artistName,
      source: this.name,
      sourceAlbumUrl: album.sourceAlbumUrl,
      attributionText: SPOTIFY_ATTRIBUTION,
      tracks: tracks.map((track) => ({
        id: track.id,
        spotifyTrackId: track.id,
        sourceTrackUrl:
          track.external_urls?.spotify ||
          `https://open.spotify.com/track/${track.id}`,
        position: String(track.track_number),
        number: String(track.track_number),
        discNumber: track.disc_number || 1,
        title: track.name,
        lengthMs: track.duration_ms || null,
        recordingMbid: null,
        artistName: (track.artists || [])
          .map((artist: any) => artist.name)
          .join(', '),
        explicit: Boolean(track.explicit),
      })),
    };
  }
  async getArtistDetails(id: string) {
    return normalizeSpotifyArtist(await this.service.getArtistById(id));
  }
  async getArtistAlbums(id: string) {
    return ((await this.service.getArtistAlbums(id)) as any[]).map(
      normalizeSpotifyAlbum,
    );
  }
}
