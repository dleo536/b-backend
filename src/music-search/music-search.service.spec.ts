import { MusicSearchService } from './music-search.service';

describe('MusicSearchService', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('always routes artist search to MusicBrainz even when album search provider is Spotify', async () => {
    process.env = {
      ...originalEnv,
      MUSIC_SEARCH_PROVIDER: 'spotify',
    };
    const musicBrainzService = {
      searchAlbums: jest.fn(),
      searchArtists: jest.fn().mockResolvedValue([
        {
          id: 'artist-mbid',
          musicbrainzArtistId: 'artist-mbid',
          name: 'Prince',
          imageUrl: 'https://images.example/prince.jpg',
          source: 'musicbrainz',
        },
      ]),
    };
    const spotifyService = {
      searchAlbums: jest.fn(),
      searchArtists: jest.fn(),
    };
    const service = new MusicSearchService(
      musicBrainzService as any,
      spotifyService as any,
    );

    const result = await service.searchArtists('Prince', 10, 0);

    expect(musicBrainzService.searchArtists).toHaveBeenCalledWith(
      'Prince',
      10,
      0,
    );
    expect(spotifyService.searchArtists).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        musicbrainzArtistId: 'artist-mbid',
        imageUrl: 'https://images.example/prince.jpg',
        source: 'musicbrainz',
      }),
    ]);
  });
});
