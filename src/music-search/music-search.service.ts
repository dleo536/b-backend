import { Injectable } from '@nestjs/common';
import { MusicBrainzService } from '../musicbrainz/musicbrainz.service';
import { SpotifyService } from '../spotify/spotify.service';

type MusicSearchProvider = 'musicbrainz' | 'spotify';

@Injectable()
export class MusicSearchService {
  constructor(
    private readonly musicBrainzService: MusicBrainzService,
    private readonly spotifyService: SpotifyService,
  ) {}

  private getProvider(): MusicSearchProvider {
    const provider = process.env.MUSIC_SEARCH_PROVIDER?.trim().toLowerCase();

    return provider === 'spotify' ? 'spotify' : 'musicbrainz';
  }

  private normalizeSpotifyAlbum(album: any) {
    const artistName =
      Array.isArray(album?.artists) && album.artists.length > 0
        ? album.artists.map((artist) => artist?.name).filter(Boolean).join(', ')
        : 'Unknown Artist';
    const coverUrl = album?.images?.[0]?.url || null;
    const firstArtistId = Array.isArray(album?.artists)
      ? album.artists.find((artist) => artist?.id)?.id || null
      : null;
    const releaseDate =
      typeof album?.release_date === 'string' ? album.release_date : null;

    return {
      ...album,
      title: album?.name || 'Untitled Album',
      artistName,
      releaseYear:
        releaseDate && releaseDate.length >= 4 ? releaseDate.slice(0, 4) : null,
      firstReleaseDate: releaseDate,
      musicbrainzReleaseGroupId: null,
      musicbrainzArtistId: null,
      primaryType: album?.album_type || 'album',
      secondaryTypes: [],
      coverUrl,
      coverArtUrl: coverUrl,
      source: 'spotify',
      sourceProvider: 'spotify',
      artists:
        Array.isArray(album?.artists) && album.artists.length > 0
          ? album.artists
          : [{ id: firstArtistId, name: artistName }],
    };
  }

  private normalizeSpotifyArtist(artist: any) {
    return {
      ...artist,
      sortName: null,
      musicbrainzArtistId: null,
      type: artist?.type || 'artist',
      country: null,
      disambiguation: null,
      source: 'spotify',
      sourceProvider: 'spotify',
      images: Array.isArray(artist?.images) ? artist.images : [],
      genres: Array.isArray(artist?.genres) ? artist.genres : [],
    };
  }

  async searchAlbums(query: string, limit = 20, offset = 0, market?: string) {
    if (this.getProvider() === 'spotify') {
      const response = await this.spotifyService.searchAlbums(
        query,
        limit,
        offset,
        market,
      );
      const albums = Array.isArray((response as any)?.albums?.items)
        ? (response as any).albums.items
        : [];

      return albums
        .filter((album) =>
          typeof album?.album_type === 'string'
            ? album.album_type.toLowerCase() === 'album'
            : true,
        )
        .map((album) => this.normalizeSpotifyAlbum(album));
    }

    return this.musicBrainzService.searchAlbums(query, limit, offset);
  }

  async searchArtists(query: string, limit = 20, offset = 0) {
    if (this.getProvider() === 'spotify') {
      const response = await this.spotifyService.searchArtists(
        query,
        limit,
        offset,
      );
      const artists = Array.isArray((response as any)?.artists?.items)
        ? (response as any).artists.items
        : [];

      return artists.map((artist) => this.normalizeSpotifyArtist(artist));
    }

    return this.musicBrainzService.searchArtists(query, limit, offset);
  }
}
