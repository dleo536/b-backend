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
          releases: [
            { id: 'release-album', status: 'Official', date: '1992-03-01' },
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
                '250':
                  'https://coverartarchive.org/release/release-album/250.jpg',
                '500':
                  'http://coverartarchive.org/release/release-album/500.jpg',
                large:
                  'https://coverartarchive.org/release/release-album/large.jpg',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchAlbums('The', 20);
    const searchUrl = new URL(mockFetch.mock.calls[0][0].toString());
    const releasesUrl = new URL(mockFetch.mock.calls[1][0].toString());
    const coverArtUrl = new URL(mockFetch.mock.calls[2][0].toString());

    expect(searchUrl.origin).toBe('https://musicbrainz-full.bsides.pro');
    expect(searchUrl.pathname).toBe('/ws/2/release-group');
    expect(searchUrl.searchParams.get('query')).toBe(
      'releasegroup:"The" AND primarytype:"album"',
    );
    expect(searchUrl.searchParams.get('fmt')).toBe('json');
    expect(searchUrl.searchParams.get('limit')).toBe('20');
    expect(releasesUrl.pathname).toBe('/ws/2/release-group/rg-album');
    expect(releasesUrl.searchParams.get('inc')).toBe('releases');
    expect(coverArtUrl.pathname).toBe('/release/release-album');
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
        coverArtUrl:
          'https://coverartarchive.org/release/release-album/500.jpg',
        coverUrl: 'https://coverartarchive.org/release/release-album/500.jpg',
        coverArtSource: 'cover_art_archive_release',
        coverArtProvider: 'cover_art_archive',
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
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));

    const result = await service.searchAlbums('No Cover');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'rg-no-cover',
        coverArtUrl: null,
        coverUrl: null,
        coverArtSource: null,
        coverArtProvider: null,
        images: [],
      }),
    ]);
  });

  it('asks MusicBrainz for album release groups before paging', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ 'release-groups': [] }), { status: 200 }),
    );

    await service.searchAlbums('b', 10, 10);
    const searchUrl = new URL(mockFetch.mock.calls[0][0].toString());

    expect(searchUrl.searchParams.get('query')).toBe(
      'releasegroup:"b" AND primarytype:"album"',
    );
    expect(searchUrl.searchParams.get('limit')).toBe('10');
    expect(searchUrl.searchParams.get('offset')).toBe('10');
  });

  it('falls back from exact release cover art to release-group cover art', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-group-cover',
              title: 'Group Cover',
              'primary-type': 'Album',
              'artist-credit': [{ artist: { id: 'artist-1', name: 'Artist' } }],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          releases: [{ id: 'release-no-cover', status: 'Official' }],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images: [
            {
              front: true,
              thumbnails: { '500': 'https://images.example/group-500.jpg' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchAlbums('Group Cover');
    const releaseCoverUrl = new URL(mockFetch.mock.calls[2][0].toString());
    const releaseGroupCoverUrl = new URL(mockFetch.mock.calls[3][0].toString());

    expect(releaseCoverUrl.pathname).toBe('/release/release-no-cover');
    expect(releaseGroupCoverUrl.pathname).toBe('/release-group/rg-group-cover');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'rg-group-cover',
        coverArtUrl: 'https://images.example/group-500.jpg',
        coverArtSource: 'cover_art_archive_release_group',
        coverArtProvider: 'cover_art_archive',
      }),
    ]);
  });

  it('falls back to Apple Music artwork when Cover Art Archive has no artwork', async () => {
    const mockAppleMusicService = {
      searchAlbums: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'apple-album',
            title: 'Fallback Album',
            artistName: 'Fallback Artist',
            releaseDate: '2001-06-01',
            coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/apple.jpg',
          },
        ],
      }),
    };
    service = new MusicBrainzService(mockAppleMusicService as any);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-apple-cover',
              title: 'Fallback Album',
              'primary-type': 'Album',
              'first-release-date': '2001-05-29',
              'artist-credit': [
                { artist: { id: 'artist-1', name: 'Fallback Artist' } },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));

    const result = await service.searchAlbums('Fallback Album');

    expect(mockAppleMusicService.searchAlbums).toHaveBeenCalledWith(
      'Fallback Album Fallback Artist',
      5,
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'rg-apple-cover',
        coverArtUrl: 'https://is1-ssl.mzstatic.com/image/thumb/apple.jpg',
        coverArtSource: 'apple_music',
        coverArtProvider: 'apple_music',
        coverArtAttribution: 'Artwork provided by Apple Music',
      }),
    ]);
  });

  it('prioritizes stronger title matches before cover art availability', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-exact-no-cover',
              title: 'Blue',
              'primary-type': 'Album',
              'artist-credit': [
                { artist: { id: 'artist-1', name: 'Exact Artist' } },
              ],
            },
            {
              id: 'rg-covered-partial',
              title: 'The Blue Sessions',
              'primary-type': 'Album',
              'artist-credit': [
                { artist: { id: 'artist-2', name: 'Covered Artist' } },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          releases: [{ id: 'release-covered', status: 'Official' }],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images: [
            {
              front: true,
              thumbnails: { '500': 'https://images.example/covered.jpg' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchAlbums('blue');

    expect(result.map((album) => album.id)).toEqual([
      'rg-exact-no-cover',
      'rg-covered-partial',
    ]);
  });

  it('prioritizes covered albums when title match quality is equal', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-no-cover',
              title: 'Blue Weekend',
              'primary-type': 'Album',
              'artist-credit': [
                { artist: { id: 'artist-1', name: 'No Cover Artist' } },
              ],
            },
            {
              id: 'rg-with-cover',
              title: 'Blue Train',
              'primary-type': 'Album',
              'artist-credit': [
                { artist: { id: 'artist-2', name: 'Cover Artist' } },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          releases: [{ id: 'release-with-cover', status: 'Official' }],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images: [
            {
              front: true,
              thumbnails: { '500': 'https://images.example/with-cover.jpg' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchAlbums('blue');

    expect(result.map((album) => album.id)).toEqual([
      'rg-with-cover',
      'rg-no-cover',
    ]);
  });

  it('selects a representative release and groups personnel credits by person', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          releases: [
            {
              id: 'release-promo',
              status: 'Promotion',
              date: '2000-01-01',
              media: [],
            },
            {
              id: 'release-official',
              status: 'Official',
              country: 'US',
              date: '1999-01-01',
              media: [
                {
                  format: 'Digital Media',
                  position: 1,
                  tracks: [
                    {
                      id: 'track-1',
                      number: '1',
                      title: 'First Track',
                      recording: { id: 'recording-1' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'release-official',
          relations: [
            {
              type: 'mastering',
              artist: { id: 'artist-master', name: 'Master Person' },
            },
          ],
          media: [
            {
              position: 1,
              tracks: [
                {
                  number: '1',
                  title: 'First Track',
                  recording: {
                    id: 'recording-1',
                    relations: [
                      {
                        type: 'producer',
                        artist: { id: 'artist-producer', name: 'Producer One' },
                      },
                      {
                        type: 'mix',
                        artist: { id: 'artist-producer', name: 'Producer One' },
                      },
                      {
                        type: 'performance',
                        work: {
                          id: 'work-1',
                          relations: [
                            {
                              type: 'composer',
                              artist: {
                                id: 'artist-composer',
                                name: 'Composer One',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.getAlbumPersonnel('rg-personnel');
    const browseUrl = new URL(mockFetch.mock.calls[0][0].toString());
    const releaseUrl = new URL(mockFetch.mock.calls[1][0].toString());

    expect(browseUrl.pathname).toBe('/ws/2/release');
    expect(browseUrl.searchParams.get('release-group')).toBe('rg-personnel');
    expect(releaseUrl.pathname).toBe('/ws/2/release/release-official');
    expect(result).toEqual({
      releaseGroupMbid: 'rg-personnel',
      releaseMbid: 'release-official',
      source: 'musicbrainz',
      personnel: [
        {
          name: 'Composer One',
          musicbrainzArtistId: 'artist-composer',
          roles: ['composer'],
          albumLevelRoles: [],
          tracks: [
            {
              title: 'First Track',
              position: '1',
              roles: ['composer'],
            },
          ],
        },
        {
          name: 'Master Person',
          musicbrainzArtistId: 'artist-master',
          roles: ['mastering'],
          albumLevelRoles: ['mastering'],
          tracks: [],
        },
        {
          name: 'Producer One',
          musicbrainzArtistId: 'artist-producer',
          roles: ['mix', 'producer'],
          albumLevelRoles: [],
          tracks: [
            {
              title: 'First Track',
              position: '1',
              roles: ['mix', 'producer'],
            },
          ],
        },
      ],
    });
  });

  it('returns safe empty personnel when MusicBrainz has no usable release', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );

    const result = await service.getAlbumPersonnel('rg-empty');

    expect(result).toEqual({
      releaseGroupMbid: 'rg-empty',
      releaseMbid: null,
      source: 'musicbrainz',
      personnel: [],
    });
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
