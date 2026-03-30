import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { SpotifyService } from './spotify.service';

describe('SpotifyService', () => {
  const originalEnv = process.env;
  let service: SpotifyService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SPOTIFY_CLIENT_ID: 'test-client-id',
      SPOTIFY_CLIENT_SECRET: 'test-client-secret',
    };
    service = new SpotifyService();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  it('caches the Spotify access token between requests', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'token-123',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'album-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'album-2' }), { status: 200 }),
      );

    await service.getAlbum('album-1');
    await service.getAlbum('album-2');

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://accounts.spotify.com/api/token',
    );
  });

  it('retries once when Spotify responds with 401', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'expired-token',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'fresh-token',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'album-1' }), { status: 200 }),
      );

    const result = await service.getAlbum('album-1');

    expect((result as any).id).toBe('album-1');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('caches identical Spotify resource responses', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'token-123',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'album-1' }), { status: 200 }),
      );

    const firstResult = await service.getAlbum('album-1');
    const secondResult = await service.getAlbum('album-1');

    expect((firstResult as any).id).toBe('album-1');
    expect((secondResult as any).id).toBe('album-1');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('bounds album search query params before calling Spotify', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'token-123',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            albums: {
              items: [],
              total: 0,
            },
          }),
          { status: 200 },
        ),
      );

    await service.searchAlbums('  test query  ', 500, -25, 'us');

    const searchUrl = new URL((global.fetch as jest.Mock).mock.calls[1][0]);
    expect(searchUrl.searchParams.get('q')).toBe('test query');
    expect(searchUrl.searchParams.get('limit')).toBe('25');
    expect(searchUrl.searchParams.get('offset')).toBe('0');
    expect(searchUrl.searchParams.get('market')).toBe('US');
  });

  it('throws when Spotify credentials are missing', async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;

    await expect(service.getAlbum('album-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws a gateway error when Spotify token exchange fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response('spotify error', { status: 500 }),
    );

    await expect(service.getAlbum('album-1')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
