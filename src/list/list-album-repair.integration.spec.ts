import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { DataSource } from 'typeorm';
import { AddAlbumRepairAudit1791504000000 } from '../migrations/1791504000000-AddAlbumRepairAudit';
import { ListAlbumRepairService } from './list-album-repair.service';
import { ModeratorListService } from './moderator-list.service';
import { AddModeratorListActions1791507600000 } from '../migrations/1791507600000-AddModeratorListActions';

const enabled = process.env.RUN_LIST_REPAIR_PG_TEST === '1';
(enabled ? describe : describe.skip)(
  'list repair audit migration and transactions in disposable PostgreSQL',
  () => {
    let db: DataSource;
    let service: ListAlbumRepairService;
    let moderatorLists: ModeratorListService;
    const schema = `list_repair_${randomUUID().replace(/-/g, '')}`;
    const listId = randomUUID();
    const otherListId = randomUUID();
    const albumId = randomUUID();
    const actorId = randomUUID();
    const spotifyAlbumId = '1234567890123456789012';
    const original = ['keep-first', albumId, 'keep-last'];
    const user: any = {
      uid: 'fixture-moderator',
      appUserId: actorId,
      email: 'dannyapolistest@gmail.com',
      email_verified: true,
    };
    const input = {
      albumId,
      spotifyAlbumId,
      reason: 'Reviewed this list and Spotify edition',
    };
    beforeAll(async () => {
      if (
        process.env.DB_HOST !== '127.0.0.1' ||
        process.env.DB_PORT !== '55439' ||
        process.env.DB_NAME !== 'bsides_list_repair_test'
      )
        throw new Error('Use only the disposable list repair fixture database');
      const options = {
        type: 'postgres' as const,
        host: '127.0.0.1',
        port: 55439,
        username: userInfo().username,
        installExtensions: false,
        synchronize: false,
      };
      const admin = await new DataSource({
        ...options,
        database: 'postgres',
      }).initialize();
      try {
        const existing = await admin.query(
          `SELECT 1 FROM pg_database WHERE datname='bsides_list_repair_test'`,
        );
        if (!existing.length)
          await admin.query('CREATE DATABASE bsides_list_repair_test');
      } finally {
        await admin.destroy();
      }
      db = await new DataSource({
        ...options,
        database: 'bsides_list_repair_test',
        extra: { options: `-c search_path=${schema},public` },
      }).initialize();
      await db.query(
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
      );
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(
        'CREATE TABLE album_lists ("id" uuid PRIMARY KEY, "albumIds" varchar[] NOT NULL, "itemsCount" int, "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz)',
      );
      await db.query(
        'CREATE TABLE metadata_albums ("id" uuid PRIMARY KEY, "musicbrainzReleaseGroupId" varchar(36), "musicbrainzReleaseId" varchar(36), "title" text, "artistName" text)',
      );
      await db.query(
        'CREATE TABLE reviews ("albumId" uuid, "releaseGroupMbId" varchar(36), "releaseMbId" varchar(36), "albumTitleSnapshot" text, "artistNameSnapshot" text, "createdAt" timestamptz DEFAULT now())',
      );
      await db.query(
        'INSERT INTO album_lists ("id","albumIds","itemsCount") VALUES ($1,$2,3),($3,$2,3)',
        [listId, original, otherListId],
      );
      const runner = db.createQueryRunner();
      try {
        await new AddAlbumRepairAudit1791504000000().up(runner);
        await new AddModeratorListActions1791507600000().up(runner);
      } finally {
        await runner.release();
      }
      moderatorLists = new ModeratorListService(db);
      service = new ListAlbumRepairService(db, {
        getAlbum: async () => ({
          id: spotifyAlbumId,
          name: 'Album',
          artists: [{ id: spotifyAlbumId, name: 'Artist' }],
        }),
      } as any);
    });
    afterAll(async () => {
      if (db?.isInitialized) {
        await db.query(`DROP SCHEMA "${schema}" CASCADE`);
        await db.destroy();
      }
    });
    it('appends concurrently without losing entries, deduplicates retries, and audits only selected lists', async () => {
      const id = randomUUID();
      await db.query(
        'INSERT INTO album_lists ("id","albumIds","itemsCount") VALUES ($1,$2,3)',
        [id, original],
      );
      const otherBefore = await db.query(
        'SELECT * FROM album_lists WHERE id=$1',
        [otherListId],
      );
      await Promise.all([
        moderatorLists.addAlbum(user, id, spotifyAlbumId),
        moderatorLists.addAlbum(user, id, 'abcdefghijklmnopqrstuv'),
      ]);
      expect(
        (await moderatorLists.addAlbum(user, id, spotifyAlbumId)).added,
      ).toBe(false);
      const [changed] = await db.query(
        'SELECT * FROM album_lists WHERE id=$1',
        [id],
      );
      expect(changed.albumIds.slice(0, 3)).toEqual(original);
      expect(changed.albumIds).toHaveLength(5);
      expect(changed.albumIds).toContain(spotifyAlbumId);
      expect(changed.albumIds).toContain('abcdefghijklmnopqrstuv');
      expect(changed.itemsCount).toBe(5);
      const audit = await db.query(
        'SELECT * FROM list_moderator_actions WHERE "listId"=$1 ORDER BY "createdAt"',
        [id],
      );
      expect(audit).toHaveLength(2);
      expect(
        audit.find((row: any) => row.beforeAlbumIds.length === 3)
          ?.beforeAlbumIds,
      ).toEqual(original);
      expect(audit[0].actorUserId).toBe(actorId);
      expect(
        await db.query('SELECT * FROM album_lists WHERE id=$1', [otherListId]),
      ).toEqual(otherBefore);
    });
    it('allows removal and reordering, retains original IDs, rejects stale edits and inserted IDs', async () => {
      const id = randomUUID();
      await db.query(
        'INSERT INTO album_lists ("id","albumIds","itemsCount") VALUES ($1,$2,3)',
        [id, original],
      );
      await moderatorLists.editAlbums(user, id, {
        albumIds: ['keep-last', 'keep-first'],
        expectedAlbumIds: original,
      });
      const [audit] = await db.query(
        'SELECT * FROM list_moderator_actions WHERE "listId"=$1',
        [id],
      );
      expect(audit.beforeAlbumIds).toEqual(original);
      expect(audit.afterAlbumIds).toEqual(['keep-last', 'keep-first']);
      await expect(
        moderatorLists.editAlbums(user, id, {
          albumIds: [],
          expectedAlbumIds: original,
        }),
      ).rejects.toThrow('This list changed');
      await expect(
        moderatorLists.editAlbums(user, id, {
          albumIds: [spotifyAlbumId],
          expectedAlbumIds: audit.afterAlbumIds,
        }),
      ).rejects.toThrow('only remove or reorder');
      await expect(
        moderatorLists.editAlbums(user, id, {
          albumIds: ['keep-last', 'keep-last'],
          expectedAlbumIds: audit.afterAlbumIds,
        }),
      ).rejects.toThrow('only remove or reorder');
      expect(
        (await db.query('SELECT * FROM album_lists WHERE id=$1', [id]))[0]
          .albumIds,
      ).toEqual(audit.afterAlbumIds);
      expect(
        await db.query(
          'SELECT * FROM list_moderator_actions WHERE "listId"=$1',
          [id],
        ),
      ).toHaveLength(1);
      await moderatorLists.editAlbums(user, id, {
        albumIds: [],
        expectedAlbumIds: audit.afterAlbumIds,
      });
      expect(
        (await db.query('SELECT * FROM album_lists WHERE id=$1', [id]))[0]
          .itemsCount,
      ).toBe(0);
    });
    it('rolls back moderator additions and audit records together on a write failure', async () => {
      const id = randomUUID();
      await db.query(
        'INSERT INTO album_lists ("id","albumIds","itemsCount") VALUES ($1,$2,3)',
        [id, original],
      );
      await db.query(
        `ALTER TABLE album_lists ADD CONSTRAINT reject_moderator_add CHECK ("id"<>'${id}'::uuid OR NOT ('1234567890123456789012'=ANY("albumIds")))`,
      );
      try {
        await expect(
          moderatorLists.addAlbum(user, id, spotifyAlbumId),
        ).rejects.toThrow();
        expect(
          (await db.query('SELECT * FROM album_lists WHERE id=$1', [id]))[0]
            .albumIds,
        ).toEqual(original);
        expect(
          await db.query(
            'SELECT * FROM list_moderator_actions WHERE "listId"=$1',
            [id],
          ),
        ).toHaveLength(0);
      } finally {
        await db.query(
          'ALTER TABLE album_lists DROP CONSTRAINT reject_moderator_add',
        );
      }
    });
    it('previews with zero writes, changes only the selected list, retains IDs in history, and undoes safely', async () => {
      const before = await db.query('SELECT * FROM album_lists ORDER BY id');
      const preview = await service.preview(user, listId, input);
      expect(preview.currentTitle).toBeNull();
      expect(await db.query('SELECT * FROM album_lists ORDER BY id')).toEqual(
        before,
      );
      expect(await db.query('SELECT * FROM list_album_repairs')).toHaveLength(
        0,
      );
      const applied = await service.apply(user, listId, {
        ...input,
        previewFingerprint: preview.previewFingerprint,
      });
      const [changed] = await db.query(
        'SELECT * FROM album_lists WHERE id=$1',
        [listId],
      );
      const [other] = await db.query('SELECT * FROM album_lists WHERE id=$1', [
        otherListId,
      ]);
      expect(changed.albumIds).toEqual([
        'keep-first',
        spotifyAlbumId,
        'keep-last',
      ]);
      expect(other).toEqual(before.find((row: any) => row.id === otherListId));
      const [audit] = await db.query('SELECT * FROM list_album_repairs');
      expect(audit.beforeJson.albumIds).toEqual(original);
      expect(audit.actorUserId).toBe(actorId);
      expect(await db.query('SELECT * FROM metadata_albums')).toHaveLength(0);
      expect(await db.query('SELECT * FROM reviews')).toHaveLength(0);
      await service.undo(user, listId, applied.auditId);
      const [restored] = await db.query(
        'SELECT * FROM album_lists WHERE id=$1',
        [listId],
      );
      expect(restored.albumIds).toEqual(original);
      expect(
        (await db.query('SELECT "undoneAt" FROM list_album_repairs'))[0]
          .undoneAt,
      ).not.toBeNull();
    });
    it('rolls back the list and audit together when either write fails', async () => {
      const preview = await service.preview(user, listId, input);
      const [before] = await db.query('SELECT * FROM album_lists WHERE id=$1', [
        listId,
      ]);
      const auditCount = (
        await db.query('SELECT count(*)::int AS count FROM list_album_repairs')
      )[0].count;
      await db.query(
        `ALTER TABLE album_lists ADD CONSTRAINT fixture_reject_spotify CHECK ("id"<>'${listId}'::uuid OR NOT ('1234567890123456789012' = ANY("albumIds")))`,
      );
      await expect(
        service.apply(user, listId, {
          ...input,
          previewFingerprint: preview.previewFingerprint,
        }),
      ).rejects.toThrow();
      expect(
        (await db.query('SELECT * FROM album_lists WHERE id=$1', [listId]))[0],
      ).toEqual(before);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM list_album_repairs',
          )
        )[0].count,
      ).toBe(auditCount);
      await db.query(
        'ALTER TABLE album_lists DROP CONSTRAINT fixture_reject_spotify',
      );
    });
  },
);
