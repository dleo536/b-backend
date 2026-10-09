import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { loadMappingEnvironment } from '../src/metadata/spotify-mapping-environment';
import { SpotifyService } from '../src/spotify/spotify.service';
import {
  albumSourceFingerprint,
  albumSourceKey,
  applyAlbumMatch,
  readMappingInventory,
  rankSpotifyAlbums,
  scoreSpotifyAlbum,
} from '../src/metadata/spotify-album-mapping';
import type { AlbumMatch } from '../src/metadata/spotify-album-mapping';
import { isMbid, isSpotifyId } from '../src/metadata/metadata-catalog.service';
import {
  describeMappingFailure,
  MappingCommandError,
} from '../src/metadata/spotify-mapping-diagnostics';
import type { MappingStage } from '../src/metadata/spotify-mapping-diagnostics';

let mappingStage: MappingStage = 'setup';

type Report = {
  schemaVersion: 1;
  mode: 'dry-run';
  createdAt: string;
  databaseFingerprint: string;
  market?: string;
  entries: Array<AlbumMatch & { sourceFingerprint: string }>;
};
const csvCell = (value: unknown) => {
  let text = Array.isArray(value)
    ? value.join('; ')
    : value == null
      ? ''
      : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const quoteSearch = (value: string) =>
  `"${value.replace(/["\\]/g, ' ').trim()}"`;

async function main() {
  const args = process.argv.slice(2);
  const allowed =
    /^(--dry-run|--apply|--help|--env-file=.+|--min-confidence=.+|--report=.+|--market=.+|--limit=\d+)$/;
  if (args.some((arg) => !allowed.test(arg)))
    throw new MappingCommandError('Unknown option. Use --help.');
  if (args.includes('--help')) {
    console.log(
      'Dry run: npm run map:spotify-albums -- --dry-run [--env-file=.env.prod] [--report=reports/mapping.json] [--market=US] [--limit=100]\nApply reviewed report: npm run map:spotify-albums -- --apply [--env-file=.env.prod] --min-confidence=0.9 --report=reports/mapping.json\nWithout --env-file, .env is used. Explicit shell variables override the selected file.',
    );
    return;
  }
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run'))
    throw new MappingCommandError('Choose --dry-run or --apply, not both');
  const option = (key: string) =>
    args
      .find((arg) => arg.startsWith(`--${key}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const minConfidence = Number(option('min-confidence') || 0.9);
  if (
    !Number.isFinite(minConfidence) ||
    minConfidence < 0.9 ||
    minConfidence > 1
  )
    throw new MappingCommandError('--min-confidence must be between 0.9 and 1');
  const market = option('market')?.toUpperCase();
  if (market && !/^[A-Z]{2}$/.test(market))
    throw new MappingCommandError('--market must be a two-letter code');
  const reportPath = resolve(
    option('report') ||
      `reports/spotify-albums-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  if (apply && !option('report'))
    throw new MappingCommandError(
      '--apply requires --report=<reviewed dry-run JSON>; run --dry-run first',
    );
  const environment = loadMappingEnvironment(option('env-file'));
  Object.assign(process.env, environment.values);
  if (!process.env.DB_HOST || !process.env.DB_NAME)
    throw new MappingCommandError(
      'DB_HOST and DB_NAME are required. No database was contacted.',
    );
  const fingerprint = createHash('sha256')
    .update(
      [
        process.env.DB_HOST,
        process.env.DB_PORT || '5432',
        process.env.DB_NAME,
      ].join(':'),
    )
    .digest('hex');
  const spotify = new SpotifyService();
  // TypeORM otherwise attempts CREATE EXTENSION during connection setup,
  // even with synchronize=false. Dry run must not perform schema writes.
  // Keep this separate from the migration CLI data source, which loads .env
  // at import time. Selecting .env.prod must never fall back to local .env.
  const database = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: ['src/**/*.entity.ts'],
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    connectTimeoutMS: 10000,
  });
  mappingStage = 'database_connection';
  await database.initialize();
  try {
    mappingStage = 'inventory_read';
    const inventory = await database.transaction(async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      return readMappingInventory(manager);
    });
    if (!apply) {
      mappingStage = 'spotify_search';
      const entries: Report['entries'] = [];
      let failedSearchCount = 0;
      const limit = Number(option('limit') || inventory.length);
      for (const album of inventory.slice(0, limit)) {
        let candidates: any[] = [];
        let searchFailed = false;
        if (album.currentTitle && album.currentArtistName) {
          try {
            const result = (await spotify.searchAlbums(
              `album:${quoteSearch(album.currentTitle)} artist:${quoteSearch(album.currentArtistName)}`,
              10,
              0,
              market,
            )) as any;
            candidates = result.albums?.items || [];
          } catch {
            searchFailed = true;
            failedSearchCount++;
          }
        }
        const match = rankSpotifyAlbums(album, candidates, market);
        if (!album.currentTitle || !album.currentArtistName)
          match.matchReasons = [
            'missing_stored_title_or_artist_requires_manual_review',
          ];
        if (searchFailed)
          match.matchReasons = ['spotify_search_failed_retry_dry_run'];
        entries.push({
          ...match,
          sourceFingerprint: albumSourceFingerprint(album),
        });
      }
      const report: Report = {
        schemaVersion: 1,
        mode: 'dry-run',
        createdAt: new Date().toISOString(),
        databaseFingerprint: fingerprint,
        market,
        entries,
      };
      mappingStage = 'report_write';
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, JSON.stringify(report, null, 2), {
        flag: 'wx',
        mode: 0o600,
      });
      const columns = [
        'localAlbumId',
        'legacyAlbumId',
        'musicbrainzReleaseGroupId',
        'musicbrainzReleaseId',
        'currentTitle',
        'currentArtistName',
        'currentYear',
        'spotifyAlbumId',
        'spotifyAlbumName',
        'spotifyArtistName',
        'spotifyReleaseDate',
        'spotifyAlbumUrl',
        'spotifyImageUrl',
        'confidence',
        'matchReasons',
        'status',
      ];
      await writeFile(
        reportPath.replace(/\.json$/, '') + '.csv',
        [
          columns.map(csvCell).join(','),
          ...entries.map((entry) =>
            columns.map((column) => csvCell(entry[column])).join(','),
          ),
        ].join('\n'),
        { flag: 'wx', mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          mode: 'dry-run',
          inventoryCount: inventory.length,
          examinedCount: entries.length,
          highConfidenceCount: entries.filter(
            (entry) => entry.confidence >= minConfidence,
          ).length,
          lowConfidenceCount: entries.filter(
            (entry) => entry.confidence < minConfidence,
          ).length,
          failedSearchCount,
          appliedCount: 0,
          reportPath,
        }),
      );
      if (failedSearchCount) process.exitCode = 2;
      return;
    }
    mappingStage = 'report_read';
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as Report;
    if (
      report.schemaVersion !== 1 ||
      report.mode !== 'dry-run' ||
      report.databaseFingerprint !== fingerprint ||
      !Array.isArray(report.entries)
    )
      throw new MappingCommandError(
        'Report is invalid or belongs to another database',
      );
    if (
      report.entries.some(
        (entry) =>
          !isMbid(entry.localAlbumId) ||
          (entry.spotifyAlbumId && !isSpotifyId(entry.spotifyAlbumId)) ||
          !Number.isFinite(entry.confidence) ||
          !Array.isArray(entry.matchReasons),
      )
    )
      throw new MappingCommandError(
        'Report contains invalid identities or scores',
      );
    const currentById = new Map(
      inventory.map((album) => [albumSourceKey(album), album]),
    );
    let appliedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;
    const outcomes: any[] = [];
    const outputPath =
      reportPath.replace(/\.json$/, '') + `.applied-${Date.now()}.json`;
    mappingStage = 'report_write';
    // Confirm the audit destination is writable before any database mutation.
    await writeFile(
      outputPath,
      JSON.stringify({ appliedCount, skippedCount, conflictCount, outcomes }),
      { flag: 'wx', mode: 0o600 },
    );
    mappingStage = 'mapping_apply';
    try {
      for (const entry of report.entries) {
        if (
          (!entry.musicbrainzReleaseGroupId && !entry.musicbrainzReleaseId) ||
          !entry.spotifyAlbumId ||
          entry.status === 'rejected' ||
          entry.confidence < minConfidence ||
          entry.matchReasons.includes(
            'ambiguous_candidates_require_manual_review',
          )
        ) {
          skippedCount++;
          outcomes.push({ ...entry, outcome: 'skipped' });
          continue;
        }
        const current = currentById.get(albumSourceKey(entry));
        if (
          !current ||
          albumSourceFingerprint(current) !== entry.sourceFingerprint
        ) {
          conflictCount++;
          outcomes.push({
            ...entry,
            outcome: 'source_changed_or_already_mapped',
          });
          continue;
        }
        try {
          const freshAlbum = (await spotify.getAlbum(
            entry.spotifyAlbumId,
          )) as any;
          const verified = scoreSpotifyAlbum(
            current,
            freshAlbum,
            report.market,
          );
          if (
            verified.spotifyAlbumId !== entry.spotifyAlbumId ||
            verified.confidence < minConfidence
          ) {
            skippedCount++;
            outcomes.push({ ...entry, outcome: 'spotify_candidate_changed' });
            continue;
          }
          const freshArtist = verified.spotifyArtistId
            ? await spotify.getArtistById(verified.spotifyArtistId)
            : null;
          await database.transaction(async (manager) => {
            await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
              albumSourceKey(current),
            ]);
            const lockedInventory = await readMappingInventory(manager);
            const lockedCurrent = lockedInventory.find(
              (album) => albumSourceKey(album) === albumSourceKey(current),
            );
            if (
              !lockedCurrent ||
              albumSourceFingerprint(lockedCurrent) !== entry.sourceFingerprint
            )
              throw new MappingCommandError('Source changed since dry run');
            await applyAlbumMatch(
              manager,
              { ...verified, localAlbumId: entry.localAlbumId },
              freshAlbum,
              freshArtist,
            );
          });
          appliedCount++;
          outcomes.push({
            ...entry,
            status: 'auto_applied',
            outcome: 'applied',
          });
        } catch (error) {
          conflictCount++;
          outcomes.push({
            ...entry,
            outcome: 'conflict_no_changes',
            reason:
              error?.code === '23505'
                ? 'unique_identity_conflict'
                : 'provider_unavailable_or_identity_conflict_or_source_changed',
          });
        }
      }
    } finally {
      await writeFile(
        outputPath,
        JSON.stringify(
          { appliedCount, skippedCount, conflictCount, outcomes },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    }
    console.log(
      JSON.stringify({
        mode: 'apply',
        appliedCount,
        skippedCount,
        conflictCount,
        lowConfidenceCount: report.entries.filter(
          (entry) => entry.confidence < minConfidence,
        ).length,
        reportPath: outputPath,
      }),
    );
    if (conflictCount) process.exitCode = 2;
  } finally {
    await database.destroy();
  }
}

main().catch((error) => {
  console.error(describeMappingFailure(error, mappingStage));
  process.exitCode = 1;
});
