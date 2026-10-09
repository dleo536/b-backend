import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { DataSource } from 'typeorm';
import { AddAlbumRepairAudit1791504000000 } from '../migrations/1791504000000-AddAlbumRepairAudit';
import { ListAlbumRepairService } from './list-album-repair.service';

const enabled = process.env.RUN_LIST_REPAIR_PG_TEST === '1';
(enabled ? describe : describe.skip)(
  'list repair audit migration and transactions in disposable PostgreSQL',
  () => {
    let db: DataSource;
    let service: ListAlbumRepairService;
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
      email: 'dannyapolisttest@gmail.com',
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
      } finally {
        await runner.release();
      }
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
        'ALTER TABLE album_lists ADD CONSTRAINT fixture_reject_spotify CHECK (NOT (\'1234567890123456789012\' = ANY("albumIds")))',
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
