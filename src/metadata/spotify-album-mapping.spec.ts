import { randomUUID } from 'node:crypto';
import {
  applyAlbumMatch,
  rankSpotifyAlbums,
  readMappingInventory,
  scoreSpotifyAlbum,
  MappingAlbum,
} from './spotify-album-mapping';
const album: MappingAlbum = {
  localAlbumId: randomUUID(),
  musicbrainzReleaseGroupId: randomUUID(),
  musicbrainzReleaseId: null,
  musicbrainzArtistId: null,
  currentTitle: 'The Predator',
  currentArtistName: 'Ice Cube',
  currentYear: 1992,
  currentAlbumType: 'album',
};
const candidate = {
  id: '1234567890123456789012',
  name: 'The Predator',
  artists: [{ id: 'abcdefghijklmnopqrstuv', name: 'Ice Cube' }],
  release_date: '1992-11-17',
  album_type: 'album',
  available_markets: ['US'],
};
describe('conservative Spotify album matching', () => {
  it('scores exact title, artist, year and type at 1', () => {
    expect(scoreSpotifyAlbum(album, candidate, 'US').confidence).toBe(1);
  });
  it.each([
    { ...candidate, name: 'The Predator Deluxe Edition' },
    { ...candidate, artists: [{ name: 'Another Artist' }] },
    { ...candidate, release_date: '2000' },
    { ...candidate, album_type: 'single' },
    { ...candidate, available_markets: ['GB'] },
  ])('never auto-applies conflicting metadata %#', (item) => {
    expect(scoreSpotifyAlbum(album, item, 'US').confidence).toBeLessThan(0.9);
  });
  it('accepts normalized punctuation without ignoring version information', () => {
    expect(
      scoreSpotifyAlbum({ ...album, currentTitle: 'THE PREDATOR!' }, candidate)
        .confidence,
    ).toBe(1);
  });
  it('requires manual review when two Spotify editions score similarly', () => {
    const result = rankSpotifyAlbums(album, [
      candidate,
      { ...candidate, id: 'abcdefghijklmnopqrstuv' },
    ]);
    expect(result.confidence).toBeLessThan(0.9);
    expect(result.matchReasons).toContain(
      'ambiguous_candidates_require_manual_review',
    );
  });
  it('reports missing candidates', () => {
    expect(rankSpotifyAlbums(album, []).confidence).toBe(0);
  });
  it('reads inventory using only SELECT and does not guess list UUID types', async () => {
    const listId = randomUUID();
    const manager: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            releaseGroupMbId: album.musicbrainzReleaseGroupId,
            albumTitleSnapshot: album.currentTitle,
            artistNameSnapshot: album.currentArtistName,
          },
        ])
        .mockResolvedValueOnce([{ albumId: listId }])
        .mockResolvedValueOnce([]),
    };
    const inventory = await readMappingInventory(manager);
    expect(inventory).toHaveLength(2);
    expect(inventory.find((item) => item.legacyAlbumId === listId)).toEqual(
      expect.objectContaining({
        musicbrainzReleaseGroupId: null,
        musicbrainzReleaseId: null,
        currentTitle: null,
      }),
    );
    for (const [sql] of manager.query.mock.calls)
      expect(sql).toMatch(/^SELECT /);
  });
  it('rejects identity conflicts before writing any rows', async () => {
    const manager: any = {
      query: jest
        .fn()
        .mockResolvedValue([
          { id: randomUUID(), spotifyAlbumId: candidate.id },
        ]),
    };
    await expect(
      applyAlbumMatch(manager, scoreSpotifyAlbum(album, candidate), candidate),
    ).rejects.toThrow('conflicts');
    expect(manager.query).toHaveBeenCalledTimes(1);
  });
  it('rejects untyped list UUIDs before touching the database', async () => {
    const manager: any = { query: jest.fn() };
    await expect(
      applyAlbumMatch(
        manager,
        {
          ...scoreSpotifyAlbum(album, candidate),
          musicbrainzReleaseGroupId: null,
        },
        candidate,
      ),
    ).rejects.toThrow('Untyped');
    expect(manager.query).not.toHaveBeenCalled();
  });
});
