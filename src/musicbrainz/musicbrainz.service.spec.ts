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
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
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
    const releaseGroupCoverUrl = new URL(mockFetch.mock.calls[1][0].toString());
    const releasesUrl = new URL(mockFetch.mock.calls[2][0].toString());
    const coverArtUrl = new URL(mockFetch.mock.calls[3][0].toString());

    expect(searchUrl.origin).toBe('https://musicbrainz-full.bsides.pro');
    expect(searchUrl.pathname).toBe('/ws/2/release-group');
    expect(searchUrl.searchParams.get('query')).toBe(
      'releasegroup:"The" AND primarytype:"album"',
    );
    expect(searchUrl.searchParams.get('fmt')).toBe('json');
    expect(searchUrl.searchParams.get('limit')).toBe('20');
    expect(releaseGroupCoverUrl.pathname).toBe('/release-group/rg-album');
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
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );

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

  it('prefers release-group cover art before release cover art', async () => {
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
    const releaseGroupCoverUrl = new URL(mockFetch.mock.calls[1][0].toString());

    expect(releaseGroupCoverUrl.pathname).toBe('/release-group/rg-group-cover');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      expect.objectContaining({
        id: 'rg-group-cover',
        coverArtUrl: 'https://images.example/group-500.jpg',
        coverArtSource: 'cover_art_archive_release_group',
        coverArtProvider: 'cover_art_archive',
      }),
    ]);
  });

  it('falls back to fanart.tv albumcover before Apple Music artwork', async () => {
    process.env.FANART_API_KEY = 'fanart-secret';
    process.env.FANART_BASE_URL = 'https://fanart.example/v3/music';
    const mockAppleMusicService = {
      searchAlbums: jest.fn(),
    };
    service = new MusicBrainzService(mockAppleMusicService as any);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-fanart-cover',
              title: 'Fanart Album',
              'primary-type': 'Album',
              'artist-credit': [
                { artist: { id: 'artist-1', name: 'Fanart Artist' } },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          albumcover: [{ url: 'https://assets.fanart.tv/fanart-cover.jpg' }],
          cdart: [{ url: 'https://assets.fanart.tv/disc.png' }],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchAlbums('Fanart Album');
    const releaseGroupCoverUrl = new URL(mockFetch.mock.calls[1][0].toString());
    const releasesUrl = new URL(mockFetch.mock.calls[2][0].toString());
    const fanartUrl = new URL(mockFetch.mock.calls[3][0].toString());

    expect(releaseGroupCoverUrl.pathname).toBe(
      '/release-group/rg-fanart-cover',
    );
    expect(releasesUrl.pathname).toBe('/ws/2/release-group/rg-fanart-cover');
    expect(fanartUrl.origin).toBe('https://fanart.example');
    expect(fanartUrl.pathname).toBe('/v3/music/albums/rg-fanart-cover');
    expect(fanartUrl.searchParams.get('api_key')).toBe('fanart-secret');
    expect(mockAppleMusicService.searchAlbums).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'rg-fanart-cover',
        coverArtUrl: 'https://assets.fanart.tv/fanart-cover.jpg',
        coverArtSource: 'fanart_tv',
        coverArtProvider: 'fanart_tv',
        coverArtAttribution: 'Artwork from fanart.tv',
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
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );

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
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
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
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }));
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

  it('selects a representative release and normalizes multi-disc tracks', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          releases: [
            {
              id: 'release-no-tracks',
              status: 'Official',
              date: '1998-01-01',
              media: [],
            },
            {
              id: 'release-tracks',
              status: 'Official',
              country: 'US',
              date: '1999-01-01',
              media: [
                {
                  format: 'CD',
                  position: 1,
                  tracks: [{ recording: { id: 'recording-1' } }],
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
          id: 'release-tracks',
          title: 'Track Album',
          'artist-credit': [{ name: 'Album Artist' }],
          media: [
            {
              position: 1,
              tracks: [
                {
                  number: '1',
                  title: 'Disc One Song',
                  length: 245000,
                  recording: { id: 'recording-1' },
                },
              ],
            },
            {
              position: 2,
              tracks: [
                {
                  number: '1',
                  title: 'Disc Two Song',
                  recording: {
                    id: 'recording-2',
                    length: 180000,
                    'artist-credit': [{ name: 'Track Artist' }],
                  },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.getAlbumTracks('rg-tracks');
    const browseUrl = new URL(mockFetch.mock.calls[0][0].toString());
    const releaseUrl = new URL(mockFetch.mock.calls[1][0].toString());

    expect(browseUrl.pathname).toBe('/ws/2/release');
    expect(browseUrl.searchParams.get('release-group')).toBe('rg-tracks');
    expect(releaseUrl.pathname).toBe('/ws/2/release/release-tracks');
    expect(result).toEqual({
      releaseGroupMbid: 'rg-tracks',
      releaseMbid: 'release-tracks',
      title: 'Track Album',
      artistName: 'Album Artist',
      source: 'musicbrainz',
      tracks: [
        {
          position: '1',
          number: '1',
          discNumber: 1,
          title: 'Disc One Song',
          lengthMs: 245000,
          recordingMbid: 'recording-1',
          artistName: 'Album Artist',
        },
        {
          position: '1',
          number: '1',
          discNumber: 2,
          title: 'Disc Two Song',
          lengthMs: 180000,
          recordingMbid: 'recording-2',
          artistName: 'Track Artist',
        },
      ],
    });
  });

  it('returns safe empty tracks when MusicBrainz has no usable release', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ releases: [] }), { status: 200 }),
    );

    const result = await service.getAlbumTracks('rg-empty-tracks');

    expect(result).toEqual({
      releaseGroupMbid: 'rg-empty-tracks',
      releaseMbid: null,
      source: 'musicbrainz',
      tracks: [],
    });
  });

  it('fetches other albums by primary artist and excludes the current release group', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'rg-current',
          title: 'Current Album',
          'artist-credit': [
            { artist: { id: 'artist-1', name: 'Album Artist' } },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'release-groups': [
            {
              id: 'rg-current',
              title: 'Current Album',
              'primary-type': 'Album',
              'first-release-date': '2001-01-01',
            },
            {
              id: 'rg-newer',
              title: 'Newer Album',
              'primary-type': 'Album',
              'first-release-date': '2003-05-01',
              'artist-credit': [
                { artist: { id: 'artist-1', name: 'Album Artist' } },
              ],
            },
            {
              id: 'rg-older',
              title: 'Older Album',
              'primary-type': 'Album',
              'first-release-date': '1999-02-01',
              'artist-credit': [
                { artist: { id: 'artist-1', name: 'Album Artist' } },
              ],
            },
            {
              id: 'rg-ep',
              title: 'EP',
              'primary-type': 'EP',
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
              thumbnails: { '500': 'https://images.example/newer-500.jpg' },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ images: [] }), { status: 404 }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          releases: [
            { id: 'release-older', status: 'Official', date: '1999-02-01' },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ images: [] }), { status: 404 }),
    );

    const result = await service.getOtherAlbums('rg-current');
    const detailsUrl = new URL(mockFetch.mock.calls[0][0].toString());
    const albumsUrl = new URL(mockFetch.mock.calls[1][0].toString());
    const newerGroupCoverUrl = new URL(mockFetch.mock.calls[2][0].toString());
    const olderGroupCoverUrl = new URL(mockFetch.mock.calls[3][0].toString());
    const olderReleasesUrl = new URL(mockFetch.mock.calls[4][0].toString());
    const olderCoverUrl = new URL(mockFetch.mock.calls[5][0].toString());

    expect(detailsUrl.pathname).toBe('/ws/2/release-group/rg-current');
    expect(albumsUrl.pathname).toBe('/ws/2/release-group');
    expect(albumsUrl.searchParams.get('artist')).toBe('artist-1');
    expect(albumsUrl.searchParams.get('type')).toBe('album');
    expect(newerGroupCoverUrl.pathname).toBe('/release-group/rg-newer');
    expect(olderGroupCoverUrl.pathname).toBe('/release-group/rg-older');
    expect(olderReleasesUrl.pathname).toBe('/ws/2/release-group/rg-older');
    expect(olderCoverUrl.pathname).toBe('/release/release-older');
    expect(
      result.albums.map((album) => album.musicbrainzReleaseGroupId),
    ).toEqual(['rg-newer', 'rg-older']);
    expect(result.albums[0]).toEqual(
      expect.objectContaining({
        coverArtUrl: 'https://images.example/newer-500.jpg',
        coverUrl: 'https://images.example/newer-500.jpg',
        coverArtSource: 'cover_art_archive_release_group',
        coverArtProvider: 'cover_art_archive',
        images: [{ url: 'https://images.example/newer-500.jpg' }],
      }),
    );
    expect(result.albums[1]).toEqual(
      expect.objectContaining({
        coverArtUrl: null,
        coverUrl: null,
        images: [],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseGroupMbid: 'rg-current',
        artistMbid: 'artist-1',
        artistName: 'Album Artist',
        source: 'musicbrainz',
      }),
    );
  });

  it('fetches a fanart.tv artist background image for an album release group', async () => {
    process.env.FANART_API_KEY = 'fanart-secret';
    process.env.FANART_BASE_URL = 'https://fanart.example/v3/music';
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'rg-current',
          title: 'Current Album',
          'artist-credit': [
            { artist: { id: 'artist-1', name: 'Album Artist' } },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artistthumb: [{ url: 'https://images.example/thumb.jpg' }],
          artistbackground: [{ url: 'https://images.example/background.jpg' }],
        }),
        { status: 200 },
      ),
    );

    const result = await service.getAlbumArtistImage('rg-current');
    const detailsUrl = new URL(mockFetch.mock.calls[0][0].toString());
    const fanartUrl = new URL(mockFetch.mock.calls[1][0].toString());

    expect(detailsUrl.pathname).toBe('/ws/2/release-group/rg-current');
    expect(detailsUrl.searchParams.get('inc')).toBe('artist-credits+releases');
    expect(fanartUrl.origin).toBe('https://fanart.example');
    expect(fanartUrl.pathname).toBe('/v3/music/artist-1');
    expect(fanartUrl.searchParams.get('api_key')).toBe('fanart-secret');
    expect(result).toEqual({
      releaseGroupMbid: 'rg-current',
      artistMbid: 'artist-1',
      artistName: 'Album Artist',
      imageUrl: 'https://images.example/background.jpg',
      source: 'fanart_tv',
      imageType: 'artistbackground',
      attributionText: 'Image from fanart.tv',
    });
  });

  it('returns a safe empty artist image response when fanart.tv is not configured', async () => {
    delete process.env.FANART_API_KEY;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'rg-current',
          title: 'Current Album',
          'artist-credit': [
            { artist: { id: 'artist-1', name: 'Album Artist' } },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.getAlbumArtistImage('rg-current');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      releaseGroupMbid: 'rg-current',
      artistMbid: 'artist-1',
      artistName: 'Album Artist',
      imageUrl: null,
      source: 'fanart_tv',
      imageType: null,
      attributionText: null,
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
              'life-span': {
                begin: '1969-06-15',
                ended: false,
              },
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
        lifeSpan: {
          begin: '1969-06-15',
          end: null,
          ended: false,
        },
        imageUrl: null,
        imageSource: null,
        imageType: null,
        images: [],
        genres: [],
        source: 'musicbrainz',
        sourceProvider: 'musicbrainz',
      },
    ]);
  });

  it('enriches artist search results with fanart.tv artist thumbnails', async () => {
    process.env.FANART_API_KEY = 'fanart-secret';
    process.env.FANART_BASE_URL = 'https://fanart.example/v3/music';
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artists: [
            {
              id: 'artist-prince',
              name: 'Prince',
              'sort-name': 'Prince',
              type: 'Person',
              country: 'US',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artistbackground: [
            { url: 'https://images.example/prince-background.jpg' },
          ],
          artistthumb: [{ url: 'https://images.example/prince-thumb.jpg' }],
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchArtists('Prince', 10);
    const searchUrl = new URL(mockFetch.mock.calls[0][0].toString());
    const fanartUrl = new URL(mockFetch.mock.calls[1][0].toString());

    expect(searchUrl.pathname).toBe('/ws/2/artist');
    expect(fanartUrl.origin).toBe('https://fanart.example');
    expect(fanartUrl.pathname).toBe('/v3/music/artist-prince');
    expect(fanartUrl.searchParams.get('api_key')).toBe('fanart-secret');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'artist-prince',
        musicbrainzArtistId: 'artist-prince',
        name: 'Prince',
        imageUrl: 'https://images.example/prince-thumb.jpg',
        imageSource: 'fanart_tv',
        imageType: 'artistthumb',
        images: [{ url: 'https://images.example/prince-thumb.jpg' }],
      }),
    ]);
  });

  it('fetches an artist profile with MusicBrainz catalog albums and fanart image', async () => {
    process.env.FANART_API_KEY = 'fanart-key';
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(input.toString());

      if (url.pathname === '/ws/2/artist/artist-prince') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'artist-prince',
              name: 'Prince',
              'sort-name': 'Prince',
              type: 'Person',
              country: 'US',
              disambiguation: 'American musician',
              'life-span': {
                begin: '1958-06-07',
                end: '2016-04-21',
                ended: true,
              },
              relations: [
                {
                  type: 'wikipedia',
                  url: {
                    resource: 'https://en.wikipedia.org/wiki/Prince_(musician)',
                  },
                },
              ],
              genres: [{ name: 'funk', count: 10 }],
              tags: [{ name: 'pop', count: 6 }],
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname === '/v3/music/artist-prince') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              artistthumb: [{ url: 'https://images.example/prince.jpg' }],
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname === '/ws/2/release-group') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              'release-groups': [
                {
                  id: 'rg-purple-rain',
                  title: 'Purple Rain',
                  'primary-type': 'Album',
                  'first-release-date': '1984-06-25',
                  'artist-credit': [
                    { artist: { id: 'artist-prince', name: 'Prince' } },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname === '/release-group/rg-purple-rain') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              images: [
                {
                  front: true,
                  thumbnails: {
                    '500':
                      'https://coverartarchive.org/release-group/rg-purple-rain/500.jpg',
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname === '/api/rest_v1/page/summary/Prince_(musician)') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              extract:
                'Prince was an American singer, songwriter, musician, and record producer.',
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(new Response('', { status: 404 }));
    });

    const result = await service.getArtistProfile('artist-prince', 10);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'artist-prince',
        musicbrainzArtistId: 'artist-prince',
        name: 'Prince',
        imageUrl: 'https://images.example/prince.jpg',
        imageSource: 'fanart_tv',
        description:
          'Prince was an American singer, songwriter, musician, and record producer.',
        descriptionSource: 'MusicBrainz-linked Wikipedia',
        genres: ['funk', 'pop'],
      }),
    );
    expect(result.catalog).toEqual([
      expect.objectContaining({
        musicbrainzReleaseGroupId: 'rg-purple-rain',
        title: 'Purple Rain',
        coverArtUrl:
          'https://coverartarchive.org/release-group/rg-purple-rain/500.jpg',
      }),
    ]);
  });

  it('falls back to release-group search when artist album browse is empty', async () => {
    process.env.FANART_API_KEY = 'fanart-key';
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(input.toString());

      if (url.pathname === '/ws/2/artist/artist-prince') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'artist-prince',
              name: 'Prince',
              'sort-name': 'Prince',
              type: 'Person',
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname === '/v3/music/artist-prince') {
        return Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        );
      }

      if (
        url.pathname === '/ws/2/release-group' &&
        url.searchParams.get('artist') === 'artist-prince'
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ 'release-groups': [] }), {
            status: 200,
          }),
        );
      }

      if (
        url.pathname === '/ws/2/release-group' &&
        url.searchParams.get('query') ===
          'arid:artist-prince AND primarytype:"album"'
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              'release-groups': [
                {
                  id: 'rg-sign-o-the-times',
                  title: 'Sign o the Times',
                  'primary-type': 'Album',
                  'first-release-date': '1987-03-30',
                  'artist-credit': [
                    { artist: { id: 'artist-prince', name: 'Prince' } },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname === '/release-group/rg-sign-o-the-times') {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response('', { status: 404 }));
    });

    const result = await service.getArtistProfile('artist-prince', 10);
    const fallbackSearchUrl = mockFetch.mock.calls
      .map((call) => new URL(call[0].toString()))
      .find(
        (url) =>
          url.pathname === '/ws/2/release-group' &&
          url.searchParams.get('query') ===
            'arid:artist-prince AND primarytype:"album"',
      );

    expect(fallbackSearchUrl?.pathname).toBe('/ws/2/release-group');
    expect(fallbackSearchUrl?.searchParams.get('query')).toBe(
      'arid:artist-prince AND primarytype:"album"',
    );
    expect(result.catalog).toEqual([
      expect.objectContaining({
        musicbrainzReleaseGroupId: 'rg-sign-o-the-times',
        title: 'Sign o the Times',
      }),
    ]);
  });

  it('paginates artist catalog release groups beyond the search result limit', async () => {
    const buildReleaseGroups = (start: number, count: number) =>
      Array.from({ length: count }, (_unused, index) => {
        const albumNumber = start + index;

        return {
          id: `rg-album-${albumNumber}`,
          title: `Album ${albumNumber}`,
          'primary-type': 'Album',
          'first-release-date': `19${String(albumNumber).padStart(2, '0')}-01-01`,
          'artist-credit': [
            { artist: { id: 'artist-long', name: 'Long Catalog Artist' } },
          ],
        };
      });

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(input.toString());

      if (url.pathname === '/ws/2/artist/artist-long') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'artist-long',
              name: 'Long Catalog Artist',
              'sort-name': 'Long Catalog Artist',
              type: 'Group',
            }),
            { status: 200 },
          ),
        );
      }

      if (
        url.pathname === '/ws/2/release-group' &&
        url.searchParams.get('artist') === 'artist-long'
      ) {
        const offset = Number.parseInt(
          url.searchParams.get('offset') || '0',
          10,
        );
        const releaseGroups =
          offset === 0
            ? buildReleaseGroups(1, 100)
            : offset === 100
              ? buildReleaseGroups(101, 20)
              : [];

        return Promise.resolve(
          new Response(JSON.stringify({ 'release-groups': releaseGroups }), {
            status: 200,
          }),
        );
      }

      if (url.pathname.startsWith('/release-group/')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      if (url.pathname.startsWith('/ws/2/release-group/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ releases: [] }), { status: 200 }),
        );
      }

      return Promise.resolve(new Response('', { status: 404 }));
    });

    const result = await service.getArtistProfile('artist-long', 500);
    const releaseGroupBrowseRequests = mockFetch.mock.calls
      .map((call) => new URL(call[0].toString()))
      .filter(
        (url) =>
          url.pathname === '/ws/2/release-group' &&
          url.searchParams.get('artist') === 'artist-long',
      );

    expect(result.catalog).toHaveLength(120);
    expect(releaseGroupBrowseRequests).toHaveLength(2);
    expect(releaseGroupBrowseRequests[0].searchParams.get('limit')).toBe('100');
    expect(releaseGroupBrowseRequests[0].searchParams.get('offset')).toBeNull();
    expect(releaseGroupBrowseRequests[1].searchParams.get('limit')).toBe('100');
    expect(releaseGroupBrowseRequests[1].searchParams.get('offset')).toBe(
      '100',
    );
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
