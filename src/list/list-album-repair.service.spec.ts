import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ListAlbumRepairService } from './list-album-repair.service';

const albumId = '11111111-1111-4111-8111-111111111111';
const spotifyAlbumId = '1234567890123456789012';
const listId = '22222222-2222-4222-8222-222222222222';
const moderator: any = {
  uid: 'mod-uid',
  appUserId: 'mod-profile',
  email: 'dannyapolistest@gmail.com',
  email_verified: true,
};
const input = {
  albumId,
  spotifyAlbumId,
  reason: 'Verified the original album and Spotify edition',
};

describe('individual list repairs', () => {
  let service: ListAlbumRepairService;
  let query: jest.Mock;
  let database: any;
  let list: any;
  let audit: any;
  beforeEach(() => {
    list = {
      id: listId,
      albumIds: ['keep-first', albumId, 'keep-last'],
      updatedAt: new Date('2026-10-08T12:00:00Z'),
    };
    audit = undefined;
    query = jest.fn(async (sql: string, args: any[] = []) => {
      if (sql.includes('FROM "album_lists"')) return [structuredClone(list)];
      if (sql.includes('FROM "metadata_albums"')) return [];
      if (sql.includes('FROM "reviews"'))
        return [
          { albumTitleSnapshot: 'Old Album', artistNameSnapshot: 'Artist' },
        ];
      if (sql.startsWith('INSERT INTO "list_album_repairs"')) {
        audit = {
          id: 'audit-id',
          beforeJson: JSON.parse(args[7]),
          afterJson: JSON.parse(args[8]),
          undoneAt: null,
        };
        return [{ id: audit.id }];
      }
      if (sql.includes('FROM "list_album_repairs"'))
        return audit ? [structuredClone(audit)] : [];
      if (sql.startsWith('UPDATE "album_lists"')) {
        list.albumIds = [...args[1]];
        return [];
      }
      if (sql.startsWith('UPDATE "list_album_repairs"')) {
        audit.undoneAt = new Date();
        return [];
      }
      return [];
    });
    database = {
      transaction: jest.fn(async (...args: any[]) => args.at(-1)({ query })),
      query,
      getRepository: jest.fn(),
    };
    service = new ListAlbumRepairService(database, {
      getAlbum: jest
        .fn()
        .mockResolvedValue({
          id: spotifyAlbumId,
          name: 'Album',
          artists: [{ id: spotifyAlbumId, name: 'Artist' }],
          images: [{ url: 'https://i.scdn.co/image/cover' }],
        }),
    } as any);
  });

  it('requires moderator authorization before every database operation', async () => {
    const outsider: any = {
      ...moderator,
      email: 'other@example.com',
      roles: ['mod', 'admin'],
    };
    await expect(service.preview(outsider, listId, input)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.apply(outsider, listId, {
        ...input,
        previewFingerprint: 'f'.repeat(64),
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.getList(outsider, listId)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.findLists(outsider)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.history(outsider, listId)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.undo(outsider, listId, 'audit-id')).rejects.toThrow(
      ForbiddenException,
    );
    expect(database.transaction).not.toHaveBeenCalled();
    expect(database.getRepository).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('previews in a read-only transaction without modifying rows', async () => {
    const before = structuredClone(list);
    const result = await service.preview(moderator, listId, input);
    expect(result).toEqual(
      expect.objectContaining({
        mode: 'dry-run',
        position: 2,
        affectedListCount: 1,
        originalAlbumId: albumId,
      }),
    );
    expect(result.replacement.source).toBe('spotify');
    expect(list).toEqual(before);
    expect(query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    expect(
      query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql)),
    ).toBe(false);
  });
  it('rejects stale previews before writing an audit or list', async () => {
    const preview = await service.preview(moderator, listId, input);
    list.albumIds.push('owner-added-this');
    await expect(
      service.apply(moderator, listId, {
        ...input,
        previewFingerprint: preview.previewFingerprint,
      }),
    ).rejects.toThrow(ConflictException);
    expect(audit).toBeUndefined();
  });
  it('changes one list position and archives original IDs without updating catalog or reviews', async () => {
    const preview = await service.preview(moderator, listId, input);
    const result = await service.apply(moderator, listId, {
      ...input,
      previewFingerprint: preview.previewFingerprint,
    });
    expect(result.affectedListCount).toBe(1);
    expect(list.albumIds).toEqual(['keep-first', spotifyAlbumId, 'keep-last']);
    expect(audit.beforeJson.albumIds).toEqual([
      'keep-first',
      albumId,
      'keep-last',
    ]);
    const writes = query.mock.calls.filter(([sql]) =>
      /^(INSERT|UPDATE|DELETE)/.test(sql),
    );
    expect(writes).toHaveLength(2);
    expect(writes[1][1][0]).toBe(listId);
    expect(
      query.mock.calls.some(([sql]) =>
        /^(UPDATE|INSERT INTO) "(metadata_albums|reviews)"/.test(sql),
      ),
    ).toBe(false);
  });
  it('refuses duplicate Spotify entries', async () => {
    list.albumIds.push(spotifyAlbumId);
    await expect(service.preview(moderator, listId, input)).rejects.toThrow(
      'already in this list',
    );
    expect(audit).toBeUndefined();
  });
  it('restores the original list IDs from history', async () => {
    const preview = await service.preview(moderator, listId, input);
    await service.apply(moderator, listId, {
      ...input,
      previewFingerprint: preview.previewFingerprint,
    });
    await service.undo(moderator, listId, 'audit-id');
    expect(list.albumIds).toEqual(['keep-first', albumId, 'keep-last']);
    expect(audit.undoneAt).not.toBeNull();
  });
  it('refuses undo after another edit and preserves that edit', async () => {
    const preview = await service.preview(moderator, listId, input);
    await service.apply(moderator, listId, {
      ...input,
      previewFingerprint: preview.previewFingerprint,
    });
    list.albumIds.push('new-owner-edit');
    await expect(service.undo(moderator, listId, 'audit-id')).rejects.toThrow(
      ConflictException,
    );
    expect(list.albumIds.at(-1)).toBe('new-owner-edit');
    expect(audit.undoneAt).toBeNull();
  });
});
