import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { AppleMusicService } from './apple-music.service';

describe('AppleMusicService', () => {
  const originalEnv = process.env;
  let privateKey: string;
  let service: AppleMusicService;

  beforeAll(() => {
    const keyPair = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    privateKey = keyPair.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APPLE_MUSIC_TEAM_ID: 'TEAM123456',
      APPLE_MUSIC_KEY_ID: 'KEY1234567',
      APPLE_MUSIC_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
      APPLE_MUSIC_STOREFRONT: 'us',
    };
    service = new AppleMusicService();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  it('signs and caches the Apple Music developer token between album searches', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: { albums: { data: [] } } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: { albums: { data: [] } } }), {
          status: 200,
        }),
      );

    await service.searchAlbums('blonde');
    await service.searchAlbums('igor');

    expect(global.fetch).toHaveBeenCalledTimes(2);

    const firstAuthorization = (global.fetch as jest.Mock).mock.calls[0][1]
      .headers.Authorization;
    const secondAuthorization = (global.fetch as jest.Mock).mock.calls[1][1]
      .headers.Authorization;

    expect(firstAuthorization).toMatch(/^Bearer .+\..+\..+$/);
    expect(secondAuthorization).toBe(firstAuthorization);
  });

  it('bounds album search query params before calling Apple Music', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: {
            albums: {
              data: [
                {
                  id: '310870083',
                  type: 'albums',
                  attributes: {
                    name: 'Blonde',
                    artistName: 'Frank Ocean',
                    releaseDate: '2016-08-20',
                    upc: '123456789012',
                    artwork: {
                      url: 'https://example.com/{w}x{h}{c}.{f}',
                    },
                    trackCount: 17,
                    genreNames: ['R&B/Soul'],
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await service.searchAlbums('  blonde  ', 500, 'US', -10);
    const searchUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0]);

    expect(searchUrl.pathname).toBe('/v1/catalog/us/search');
    expect(searchUrl.searchParams.get('term')).toBe('blonde');
    expect(searchUrl.searchParams.get('types')).toBe('albums');
    expect(searchUrl.searchParams.get('limit')).toBe('25');
    expect(searchUrl.searchParams.get('offset')).toBe('0');
    expect(result.items).toEqual([
      expect.objectContaining({
        id: '310870083',
        title: 'Blonde',
        releaseDate: '2016-08-20',
        barcodeId: '123456789012',
        coverUrl: 'https://example.com/1000x1000bb.jpg',
        artists: [
          expect.objectContaining({
            name: 'Frank Ocean',
          }),
        ],
      }),
    ]);
  });

  it('throws when Apple Music credentials are missing', async () => {
    delete process.env.APPLE_MUSIC_TEAM_ID;
    delete process.env.APPLE_MUSIC_KEY_ID;
    delete process.env.APPLE_MUSIC_PRIVATE_KEY;

    await expect(service.searchAlbums('blonde')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('includes diagnostic headers when Apple Music returns an error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response('apple error', {
        status: 429,
        headers: {
          'retry-after': '60',
          'x-apple-request-id': 'request-123',
        },
      }),
    );

    const searchPromise = service.searchAlbums('blonde');

    await expect(searchPromise).rejects.toThrow(BadGatewayException);
    await expect(searchPromise).rejects.toThrow('retry-after=60');
  });
});
