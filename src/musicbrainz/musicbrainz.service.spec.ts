import { BadGatewayException } from '@nestjs/common';
import { MusicBrainzService } from './musicbrainz.service';

describe('MusicBrainzService', () => {
  let service: MusicBrainzService;
  const originalEnv = process.env;
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = {
      ...originalEnv,
      MUSICBRAINZ_BASE_URL: 'https://musicbrainz-sample.bsides.pro/ws/2',
      COVER_ART_ARCHIVE_BASE_URL: 'https://coverartarchive.org',
    };
    global.fetch = mockFetch;
    mockFetch.mockReset();
    service = new MusicBrainzService();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it('searches release groups, filters non-albums, and maps cover art', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-album',
              title: 'The Album',
              'primary-type': 'Album',
              'secondary-types': ['Compilation'],
              'first-release-date': '1992-03-01',
              'artist-credit': [
                {
                  name: 'The Artist',
                  artist: { id: 'artist-1', name: 'The Artist' },
                },
              ],
            },
            {
              id: 'rg-ep',
              title: 'The EP',
              'primary-type': 'EP',
            },
            {
              id: 'rg-single',
              title: 'The Single',
              'primary-type': 'Single',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images: [
            {
              front: true,
              image: 'https://images.example/original.jpg',
              thumbnails: {
                '250': 'https://images.example/250.jpg',
                '500': 'https://images.example/500.jpg',
                large: 'https://images.example/large.jpg',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchAlbums('The', 20);
    const searchUrl = new URL(mockFetch.mock.calls[0][0].toString());
    const coverArtUrl = new URL(mockFetch.mock.calls[1][0].toString());

    expect(searchUrl.pathname).toBe('/ws/2/release-group');
    expect(searchUrl.searchParams.get('query')).toBe(
      'releasegroup:The AND primarytype:album',
    );
    expect(searchUrl.searchParams.get('fmt')).toBe('json');
    expect(searchUrl.searchParams.get('limit')).toBe('20');
    expect(coverArtUrl.pathname).toBe('/release-group/rg-album');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'rg-album',
        title: 'The Album',
        name: 'The Album',
        artistName: 'The Artist',
        releaseYear: '1992',
        firstReleaseDate: '1992-03-01',
        musicbrainzReleaseGroupId: 'rg-album',
        musicbrainzArtistId: 'artist-1',
        primaryType: 'Album',
        secondaryTypes: ['Compilation'],
        coverArtUrl: 'https://images.example/500.jpg',
        coverUrl: 'https://images.example/500.jpg',
        source: 'musicbrainz',
      }),
    ]);
  });

  it('does not fail album search when Cover Art Archive returns 404', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-no-cover',
              title: 'No Cover',
              'primary-type': 'Album',
              'artist-credit': [{ artist: { id: 'artist-1', name: 'Artist' } }],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));

    const result = await service.searchAlbums('No Cover');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'rg-no-cover',
        coverArtUrl: null,
        coverUrl: null,
        images: [],
      }),
    ]);
  });

  it('searches and normalizes artists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artists: [
            {
              id: 'artist-ice-cube',
              name: 'Ice Cube',
              'sort-name': 'Ice Cube',
              type: 'Person',
              country: 'US',
              disambiguation: 'American rapper and actor',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchArtists('Ice Cube', 20, 10);
    const searchUrl = new URL(mockFetch.mock.calls[0][0].toString());

    expect(searchUrl.pathname).toBe('/ws/2/artist');
    expect(searchUrl.searchParams.get('query')).toBe('artist:Ice Cube');
    expect(searchUrl.searchParams.get('offset')).toBe('10');
    expect(result).toEqual([
      {
        id: 'artist-ice-cube',
        name: 'Ice Cube',
        sortName: 'Ice Cube',
        musicbrainzArtistId: 'artist-ice-cube',
        type: 'Person',
        country: 'US',
        disambiguation: 'American rapper and actor',
        images: [],
        genres: [],
        source: 'musicbrainz',
        sourceProvider: 'musicbrainz',
      },
    ]);
  });

  it('fails MusicBrainz request errors while keeping cover art failures isolated', async () => {
    mockFetch.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }));

    await expect(service.searchArtists('Ice Cube')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
