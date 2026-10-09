import { DataSource } from 'typeorm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AddMusicMetadataCatalog1791331200000 } from '../migrations/1791331200000-AddMusicMetadataCatalog';

const enabled = process.env.RUN_METADATA_PG_TEST === '1';
(enabled ? describe : describe.skip)(
  'Spotify migration and actual CLI with disposable PostgreSQL',
  () => {
    let db: DataSource;
    const mbid = randomUUID();
    const releaseId = randomUUID();
    const artistId = randomUUID();
    const lowId = randomUUID();
    const listOnlyId = randomUUID();
    const reviewId = randomUUID();
    const userId = randomUUID();
    const root = resolve(__dirname, '../..');
    const report = join(
      mkdtempSync(join(tmpdir(), 'bsides-metadata-report-')),
      'mapping.json',
    );
    beforeAll(async () => {
      if (
        process.env.DB_NAME !== 'bsides_metadata_test' ||
        process.env.DB_HOST !== '127.0.0.1' ||
        process.env.DB_PORT !== '55439'
      )
        throw new Error(
          'Integration test must use the disposable fixture database',
        );
      db = await new DataSource({
        type: 'postgres',
        host: '127.0.0.1',
        port: 55439,
        username: process.env.DB_USERNAME,
        database: 'bsides_metadata_test',
        synchronize: false,
      }).initialize();
      await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await db.query(
        'CREATE TABLE reviews ("id" uuid PRIMARY KEY, "userId" uuid NOT NULL, "albumId" uuid, "releaseGroupMbId" varchar(36) NOT NULL, "releaseMbId" varchar(36), "artistMbId" varchar(36), "spotifyAlbumId" varchar(64), "albumTitleSnapshot" text, "artistNameSnapshot" text, "body" text, "isDraft" boolean DEFAULT false, "createdAt" timestamptz DEFAULT now())',
      );
      await db.query(
        'CREATE TABLE album_lists ("id" uuid PRIMARY KEY, "albumIds" text[] NOT NULL)',
      );
      await db.query(
        'INSERT INTO reviews ("id","userId","releaseGroupMbId","releaseMbId","artistMbId","albumTitleSnapshot","artistNameSnapshot","body") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          reviewId,
          userId,
          mbid,
          releaseId,
          artistId,
          'The Predator',
          'Ice Cube',
          'Preserve this review',
        ],
      );
      await db.query(
        'INSERT INTO reviews ("id","userId","releaseGroupMbId","albumTitleSnapshot","artistNameSnapshot") VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), userId, lowId, 'Different Album', 'Different Artist'],
      );
      await db.query('INSERT INTO album_lists VALUES ($1,$2)', [
        randomUUID(),
        [mbid, releaseId, listOnlyId],
      ]);
      const runner = db.createQueryRunner();
      try {
        await new AddMusicMetadataCatalog1791331200000().up(runner);
      } finally {
        await runner.release();
      }
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    function cli(...args: string[]) {
      return execFileSync('npm', ['run', 'map:spotify-albums', '--', ...args], {
        cwd: root,
        env: {
          ...process.env,
          SPOTIFY_CLIENT_ID: 'fixture-client',
          SPOTIFY_CLIENT_SECRET: 'fixture-secret',
          SPOTIFY_BASE_URL: 'https://api.spotify.com/v1',
          SPOTIFY_ACCOUNTS_URL: 'https://accounts.spotify.com',
          NODE_OPTIONS:
            '--require=' +
            resolve(root, 'test/helpers/spotify-catalog-stub.cjs'),
        },
        encoding: 'utf8',
        timeout: 60000,
      });
    }
    it('runs dry-run with zero DB writes, then applies only the reviewed high-confidence match', async () => {
      const beforeReviews = await db.query('SELECT * FROM reviews ORDER BY id');
      const beforeLists = await db.query('SELECT * FROM album_lists');
      expect(cli('--dry-run', '--report=' + report)).toContain(
        '"appliedCount":0',
      );
      expect(await db.query('SELECT * FROM reviews ORDER BY id')).toEqual(
        beforeReviews,
      );
      expect(await db.query('SELECT * FROM album_lists')).toEqual(beforeLists);
      expect(await db.query('SELECT * FROM metadata_albums')).toEqual([]);
      const entries = JSON.parse(readFileSync(report, 'utf8')).entries;
      expect(entries).toHaveLength(3); // release reference is deduplicated, untyped UUID remains for review.
      expect(
        entries.filter((entry: any) => entry.confidence >= 0.9),
      ).toHaveLength(1);
      expect(readFileSync(report.replace('.json', '.csv'), 'utf8')).toContain(
        'localAlbumId',
      );
      expect(
        cli('--apply', '--min-confidence=0.9', '--report=' + report),
      ).toContain('"appliedCount":1');
      const [mapped] = await db.query('SELECT * FROM metadata_albums');
      expect(mapped.musicbrainzReleaseGroupId).toBe(mbid);
      expect(mapped.musicbrainzReleaseId).toBe(releaseId);
      expect(mapped.spotifyAlbumId).toBe('1234567890123456789012');
      const [review] = await db.query('SELECT * FROM reviews WHERE id=$1', [
        reviewId,
      ]);
      expect(review).toEqual(
        expect.objectContaining({
          releaseGroupMbId: mbid,
          releaseMbId: releaseId,
          artistMbId: artistId,
          spotifyAlbumId: mapped.spotifyAlbumId,
          albumId: mapped.id,
          body: 'Preserve this review',
        }),
      );
      expect(await db.query('SELECT * FROM album_lists')).toEqual(beforeLists);
      const [artist] = await db.query('SELECT * FROM metadata_artists');
      expect(artist.musicbrainzArtistId).toBe(artistId);
      expect(artist.spotifyImageUrl).toContain('test-artist');
      expect(
        await db.query(
          'SELECT "spotifyAlbumId" FROM reviews WHERE "releaseGroupMbId"=$1',
          [lowId],
        ),
      ).toEqual([{ spotifyAlbumId: null }]);
    }, 120000);
  },
);
