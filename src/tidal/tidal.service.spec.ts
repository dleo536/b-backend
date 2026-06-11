import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TidalService } from './tidal.service';

describe('TidalService', () => {
  const originalEnv = process.env;
  let service: TidalService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TIDAL_CLIENT_ID: 'test-client-id',
      TIDAL_CLIENT_SECRET: 'test-client-secret',
      TIDAL_COUNTRY_CODE: 'US',
    };
    service = new TidalService();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  it('caches the TIDAL access token between album searches', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'token-123',
            expires_in: 86400,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

    await service.searchAlbums('blonde');
    await service.searchAlbums('igor');

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://auth.tidal.com/v1/oauth2/token',
    );
  });

  it('bounds album search query params before calling TIDAL', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'token-123',
            expires_in: 86400,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: '123',
                type: 'albums',
                attributes: {
                  title: 'Blonde',
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: '123',
                type: 'albums',
                attributes: {
                  title: 'Blonde',
                  releaseDate: '2016-08-20',
                },
                relationships: {
                  artists: {
                    data: [{ id: '456', type: 'artists' }],
                  },
                },
              },
            ],
            included: [
              {
                id: '456',
                type: 'artists',
                attributes: {
                  name: 'Frank Ocean',
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: '789',
                type: 'artworks',
              },
            ],
            included: [
              {
                id: '789',
                type: 'artworks',
                attributes: {
                  mediaType: 'IMAGE',
                  files: [
                    {
                      href: 'https://example.com/blonde-small.jpg',
                      meta: {
                        width: 80,
                        height: 80,
                      },
                    },
                    {
                      href: 'https://example.com/blonde.jpg',
                      meta: {
                        width: 640,
                        height: 640,
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await service.searchAlbums('  blonde  ', 500, 'us');

    const searchUrl = new URL((global.fetch as jest.Mock).mock.calls[1][0]);
    expect(searchUrl.pathname).toBe(
      '/v2/searchResults/blonde/relationships/albums',
    );
    expect(searchUrl.searchParams.get('countryCode')).toBe('US');
    expect(searchUrl.searchParams.get('explicitFilter')).toBe('INCLUDE');
    expect(searchUrl.searchParams.get('include')).toBe('albums');
    expect(searchUrl.searchParams.has('page[limit]')).toBe(false);
    const albumsUrl = new URL((global.fetch as jest.Mock).mock.calls[2][0]);
    expect(albumsUrl.pathname).toBe('/v2/albums');
    expect(albumsUrl.searchParams.get('include')).toBe('artists');
    expect(albumsUrl.searchParams.getAll('filter[id]')).toEqual(['123']);
    const coverArtUrl = new URL((global.fetch as jest.Mock).mock.calls[3][0]);
    expect(coverArtUrl.pathname).toBe(
      '/v2/albums/123/relationships/coverArt',
    );
    expect(coverArtUrl.searchParams.get('countryCode')).toBe('US');
    expect(coverArtUrl.searchParams.get('include')).toBe('coverArt');
    expect(result.items).toEqual([
      expect.objectContaining({
        id: '123',
        title: 'Blonde',
        coverUrl: 'https://example.com/blonde.jpg',
        artists: [
          expect.objectContaining({
            name: 'Frank Ocean',
          }),
        ],
      }),
    ]);
  });

  it('throws when TIDAL credentials are missing', async () => {
    delete process.env.TIDAL_CLIENT_ID;
    delete process.env.TIDAL_CLIENT_SECRET;

    await expect(service.searchAlbums('blonde')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws a gateway error when TIDAL token exchange fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response('tidal error', { status: 500 }),
    );

    await expect(service.searchAlbums('blonde')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
