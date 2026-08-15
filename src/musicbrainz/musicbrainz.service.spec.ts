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
      MUSICBRAINZ_BASE_URL: 'https://musicbrainz-full.bsides.pro/ws/2',
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

    expect(searchUrl.origin).toBe('https://musicbrainz-full.bsides.pro');
    expect(searchUrl.pathname).toBe('/ws/2/release-group');
    expect(searchUrl.searchParams.get('query')).toBe('releasegroup:"The"');
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

  it('reads the MusicBrainz base URL from env', async () => {
    process.env.MUSICBRAINZ_BASE_URL = 'https://metadata.example/ws/2/';
    service = new MusicBrainzService();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ artists: [] }), { status: 200 }),
    );

    const result = await service.searchArtists('Ice Cube');
    const searchUrl = new URL(mockFetch.mock.calls[0][0].toString());

    expect(searchUrl.origin).toBe('https://metadata.example');
    expect(searchUrl.pathname).toBe('/ws/2/artist');
    expect(result).toEqual([]);
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
    expect(searchUrl.searchParams.get('query')).toBe('artist:"Ice Cube"');
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

  it('does not fall back to the sample URL when full MusicBrainz fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('bad gateway', { status: 502 }),
    );

    const result = await service.searchArtists('Ice Cube');
    const searchUrl = new URL(mockFetch.mock.calls[0][0].toString());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(searchUrl.origin).toBe('https://musicbrainz-full.bsides.pro');
    expect(searchUrl.toString()).not.toContain('musicbrainz-sample.bsides.pro');
    expect(result).toEqual({
      items: [],
      provider: 'musicbrainz',
      providerUnavailable: true,
      error: expect.stringContaining('MusicBrainz request failed (502)'),
    });
  });

  it('returns a safe providerUnavailable response when MusicBrainz times out', async () => {
    mockFetch.mockImplementationOnce(
      (_url: URL, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );

    const resultPromise = service.searchArtists('Ice Cube');
    jest.advanceTimersByTime(7000);
    const result = await resultPromise;

    expect(result).toEqual({
      items: [],
      provider: 'musicbrainz',
      providerUnavailable: true,
      error: 'MusicBrainz request timed out',
    });
  });
});
