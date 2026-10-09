import { MusicSearchService } from './music-search.service';

describe('MusicSearchService', () => {
  it('delegates both searches to the selected metadata service', async () => {
    const metadata = {
      searchAlbums: jest.fn().mockResolvedValue([{ spotifyAlbumId: 'album' }]),
      searchArtists: jest
        .fn()
        .mockResolvedValue([{ spotifyArtistId: 'artist' }]),
    };
    const service = new MusicSearchService(metadata as any);
    await expect(
      service.searchAlbums('Purple Rain', 10, 0, 'US'),
    ).resolves.toHaveLength(1);
    await expect(service.searchArtists('Prince', 10, 0)).resolves.toHaveLength(
      1,
    );
    expect(metadata.searchAlbums).toHaveBeenCalledWith(
      'Purple Rain',
      10,
      0,
      'US',
    );
    expect(metadata.searchArtists).toHaveBeenCalledWith('Prince', 10, 0);
  });
});
