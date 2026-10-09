# Spotify metadata provider migration

## Existing flow inspected before implementation

There was no shared album or artist table. MusicBrainz release-group IDs were stored in `reviews.releaseGroupMbId`, with optional `releaseMbId`, `artistMbId`, a nullable UUID `albumId`, and an existing optional `spotifyAlbumId`. Reviews also retain title, artist, and cover snapshots. Custom lists, backlog, and favorites all use `album_lists.albumIds`; those arrays can contain MusicBrainz UUIDs or legacy Spotify IDs. Curated recent releases store Spotify IDs and JSONB album snapshots in `recent_release_albums`.

Album search had a partial `MUSIC_SEARCH_PROVIDER` switch. Artist search, album details, tracks, other albums, personnel, and album artist images were routed through MusicBrainz. Artwork used Cover Art Archive and existing fanart/Apple Music fallbacks. The mobile app also called the raw Spotify proxy for some details.

## Implementation and files

Backend:
- `src/metadata/music-metadata-provider.ts`: shared interface.
- `musicbrainz.provider.ts`, `spotify.provider.ts`: retained MusicBrainz adapter and normalized Spotify adapter.
- `music-metadata.service.ts`, `metadata.controller.ts`, `metadata.module.ts`: active provider routing.
- `metadata-album.entity.ts`, `metadata-artist.entity.ts`, `metadata-catalog.service.ts`: durable cross-provider identities, snapshots, and alias resolution.
- `spotify-album-mapping.ts`, `scripts/map-spotify-albums.ts`: conservative matching and reviewed-report apply.
- `src/spotify/spotify.service.ts`: server-only client credentials, token caching/refresh, request caching, pagination, timeouts, sanitized errors, 429 handling, and timing/count logs.
- Album and music-search controllers/services/modules now use the provider layer. Review/list services resolve mapped aliases without rewriting list arrays. Review creation accepts Spotify-only identities and enforces reviewed cross-provider mappings.
- `src/musicbrainz/musicbrainz.service.ts` retains its existing implementation, with an additive release-to-release-group resolver used only when MusicBrainz is selected.
- `tsconfig.build.json` excludes the CLI so the production entry point remains `dist/main.js`.

Frontend:
- `app/api/SpotifyAPI.js`, `AlbumMetadataAPI.js`, `ArtistMetadataAPI.js`, `AlbumPersonnelAPI.js`, `ReviewAPI.js`, and `ListAPI.js` use normalized backend routes and preserve provider identities.
- `app/logic/albumIdentity.js` and `Review.js` keep Spotify IDs out of MusicBrainz fields.
- `MetadataAttribution.js` adds a Spotify icon and link beside Spotify metadata/artwork; `MetadataImage.js` preserves complete Spotify image framing.
- Album, artist, search, review, list, home feed, profile, user, year, new-release, and country-result screens display the attribution. Spotify images are not used beneath the album header gradient or in overlapping list-cover collages.
- List editing/reordering retains each original stored list reference.
- The existing list visual preview shows Spotify attribution, but downloading a visual containing Spotify metadata/artwork is disabled: its native renderer does not include Spotify attribution/link-backs.

## Schema

`1791331200000-AddMusicMetadataCatalog.ts` creates `metadata_albums` and `metadata_artists`, with nullable Spotify IDs, URLs, image URLs, fetched timestamps, provider/confidence fields, separate provider snapshots, and retained MusicBrainz ID fields. It makes `reviews.releaseGroupMbId` nullable for new Spotify-only reviews and adds Spotify/local lookup indexes and a Spotify-only published-review uniqueness index.

The migration changes schema only. It does not backfill or delete data, drop columns, or rewrite existing MusicBrainz IDs. `synchronize` remains false. The existing Nest configuration runs pending migrations at startup; review the SQL and validate against a database copy before deploying the backend. The mapping CLI itself never runs schema migrations automatically.

The migration's `down` deliberately refuses destructive rollback. Roll back the active provider through configuration; keep the additive schema and mappings.

## Backend environment

Set these in the backend deployment's secret/config system; never put the client secret in Expo configuration:

```env
MUSIC_METADATA_PROVIDER=spotify
SPOTIFY_CLIENT_ID=<spotify-client-id>
SPOTIFY_CLIENT_SECRET=<spotify-client-secret>
SPOTIFY_BASE_URL=https://api.spotify.com/v1
SPOTIFY_ACCOUNTS_URL=https://accounts.spotify.com
MUSICBRAINZ_BASE_URL=https://musicbrainz-full.bsides.pro/ws/2
```

Existing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, Firebase configuration, and `PORT` are still required. See `.env.example`.

Selection is read at backend startup. `MUSIC_METADATA_PROVIDER` takes precedence over the old `MUSIC_SEARCH_PROVIDER`. If both are absent, the existing MusicBrainz behavior remains the default. Invalid provider names fail startup.

Only official Spotify API/account URLs are accepted. Credentials/tokens remain server-side. No Spotify pages are scraped. Spotify search requests are capped at 10 results per request to support current development-mode limits; tracks and artist albums are paginated. Spotify entitlement, quota, and catalog availability still depend on the configured Spotify application.

## Safe deployment sequence

1. Back up the database and validate the additive migration against a database copy.
2. Apply the schema through the existing TypeORM migration process before using the new routes or CLI. Inspect pending migrations with `npm run typeorm:cli -- migration:show -d src/data-source.ts`. This is read-only.
3. Keep the MusicBrainz VM available while mapping. Deploy/backend restart requires the normal release process; do not run production apply automatically.
4. Run the mapping dry run against the intended database, then inspect JSON/CSV.
5. Apply only a reviewed report. Rerun dry run to inspect remaining unmapped items.
6. Deploy the mobile changes, select Spotify, and restart the backend. Verify the checks below before pausing the VM.

From `bsides-backend/b-backend`:

```bash
npm run map:spotify-albums -- --dry-run
npm run map:spotify-albums -- --dry-run --market=US --report=reports/spotify-mapping.json
npm run map:spotify-albums -- --apply --min-confidence=0.9 --report=reports/spotify-mapping.json
```

Without `--env-file`, the mapper loads `.env`. To select production credentials from your local checkout, use `--env-file=.env.prod` on both dry run and apply. Only the selected file is loaded; missing production settings are never filled from local `.env`. Explicit shell variables override the selected file. Neither file is modified. An explicitly selected missing/unreadable file fails before any database connection.

Default reports: `reports/spotify-albums-<timestamp>.json` plus matching `.csv`. Both are excluded from git and created with owner-only permissions. Specify a new report filename for each dry run. Optional `--limit=100` bounds dry-run work.

Apply without `--report` is rejected. Reports are tied to a hash of the database host/port/name and source metadata. Apply rechecks source metadata, refetches the Spotify album and artist, verifies score, and uses per-album transactions, advisory locks, and identity conflict checks. It writes an `.applied-<timestamp>.json` audit with applied/skipped/conflict counts. A failed row is rolled back independently; earlier successful rows remain committed. Exit 2 signals mapping conflicts or failed dry-run searches; inspect the report. Exit 1 signals setup/report/connection failure.

Dry run opens a read-only transaction and performs only SELECTs. It does not create catalog rows or modify reviews, lists, backlog, or favorites. Successful apply adds Spotify metadata/catalog identities and fills empty review `spotifyAlbumId`/`albumId` fields. It never changes MusicBrainz keys, review text, snapshot fields, or list arrays.

## Troubleshooting the mapping command

Failures report their stage and a recognized safe error code without printing credentials, SQL parameters, or upstream bodies. A connection is bounded to 10 seconds.

- `28P01`: PostgreSQL rejected the database login. Select the file containing the intended database credentials with `--env-file`; confirm its `DB_USERNAME` and `DB_PASSWORD` match that database.
- `ECONNREFUSED`: start/keep the Cloud SQL proxy running and match `DB_HOST`/`DB_PORT` to its listener.
- `42P01` or `42703`: deploy the pending schema migration to the selected database.
- `EEXIST`: choose a new report filename; existing reports are preserved.

For the proxy setup in this session, explicitly prefix the command so a local PostgreSQL server on port 5432 cannot be selected accidentally:

```bash
DB_HOST=127.0.0.1 DB_PORT=5433 npm run map:spotify-albums -- --env-file=.env.prod --dry-run --report=reports/spotify-mapping.json

# After reviewing the generated JSON/CSV:
DB_HOST=127.0.0.1 DB_PORT=5433 npm run map:spotify-albums -- --env-file=.env.prod --apply --min-confidence=0.9 --report=reports/spotify-mapping.json
```

The local backend `.env.prod` must supply the hosted database name/user/password and Spotify credentials. Leave `.env` pointed at your local database. The shell overrides above route the connection through the already-running Cloud SQL Auth Proxy on port 5433. Cloud Run's environment variables do not automatically reach a local terminal. Keep the same environment file and endpoint settings for dry run and apply because the report is tied to that endpoint.

## Matching and manual review

The inventory combines existing catalog records, review snapshots, and distinct list references without contacting MusicBrainz. Stored year/type are used when available in the catalog; reviews did not store those fields.

Scoring considers normalized title, primary artist, release year, album type, edition/version terms, and optional market availability. Conflicting artists, title/version mismatches, incompatible years/types, unavailable markets, and similarly ranked editions stay below the automatic threshold. A near year can qualify only with otherwise strong metadata. Missing title/artist yields no automatic mapping.

JSON contains local/MB/Spotify IDs, current metadata, candidate name/artist/date/URLs/image, confidence, reasons, alternatives, and status. CSV contains the requested human-review fields. Set a report entry's status to `rejected` to exclude it from apply. The CLI never bypasses the minimum threshold, even for `manually_approved`.

Untyped list-only UUIDs are reported as `legacyAlbumId` with missing metadata. They cannot safely be identified as release groups, releases, or local IDs from the array alone, so the CLI leaves them unchanged. To map those or ambiguous editions, first verify their identity and enrich the catalog in a separately reviewed, dry-run-first process, then generate a fresh report. Do not edit source fields/fingerprints in a report to force a match.

Conflicting pre-existing Spotify/local identities are reported for manual reconciliation rather than merged automatically.

## API behavior and compatibility

Existing `/music-search/albums/search?q=...` and `/music-search/artists/search?q=...` remain available. Added aliases:
- `GET /search/albums?query=...`
- `GET /search/artists?query=...`

Provider-neutral reads:
- `GET /albums/:id`
- `GET /albums/:id/tracks`
- `GET /albums/:id/other-albums`
- `GET /albums/:id/artist-image`
- `GET /albums/:id/cover-art`
- `GET /artists/:id/profile`

These routes require the existing Firebase bearer token and rate limiting. IDs can be native Spotify IDs or reviewed local/MB aliases. A mapped Spotify response retains native `spotifyAlbumId` while keeping the existing MB reference as its app ID, preserving list/review navigation.

Spotify responses carry `source='spotify'`, `sourceAlbumUrl` and/or `sourceArtistUrl`, and `attributionText='Metadata and artwork from Spotify'`. Album/artist shapes remain compatible with existing screens.

Spotify mode never calls MusicBrainz for these reads. Unmapped old reviews return saved metadata with `metadataUnavailable=true`; tracks require a reviewed mapping and return 409 if one is missing. An unidentifiable list-only album may show “Album unavailable” until mapped. Spotify has no personnel credits or artist biography in this flow, so those sections remain empty rather than waking the VM.

The explicit legacy `/musicbrainz` and raw `/spotify` backend endpoints remain available for compatibility; the migrated mobile catalog flows use the provider-neutral endpoints. The legacy musician-credits screen remains MusicBrainz-specific and is not linked from empty Spotify personnel results. Curated recent-release snapshots remain Spotify-specific as before.

## Validation and manual checks

Automated checks:
```bash
# Backend
npm run build
npm test -- --runInBand --watchman=false

# Mobile
npm run typecheck
npm test
npm run export:ios
```

The opt-in PostgreSQL test `src/metadata/spotify-mapping.integration.spec.ts` uses only a disposable `bsides_metadata_test` database on localhost port 55439. It executes the real additive migration and the actual npm dry-run/apply commands with mocked official Spotify responses, verifies dry-run leaves rows unchanged, and verifies apply preserves reviews, MB IDs, and list arrays. It does not use the app database. Run it only against a fresh disposable fixture database:
```bash
RUN_METADATA_PG_TEST=1 DB_HOST=127.0.0.1 DB_PORT=55439 DB_NAME=bsides_metadata_test DB_USERNAME=<local-user> npm test -- --runInBand --watchman=false spotify-mapping.integration
```

With a running backend and a valid Firebase token:
```bash
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" "http://localhost:3000/search/albums?query=The%20Predator"
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" "http://localhost:3000/search/artists?query=Ice%20Cube"
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" "http://localhost:3000/albums/<spotifyAlbumId>"
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" "http://localhost:3000/albums/<spotifyAlbumId>/tracks"
```

On device: search albums and artists; open a new Spotify album and an existing mapped MB album; load tracks, other albums, artist photos, and cover art; tap Spotify attribution; read and edit existing reviews; open/reorder custom lists, backlog, and favorites. Confirm no MusicBrainz traffic in Spotify mode. Check an unmapped review still displays its snapshot. These device checks remain part of release validation.

Validation performed during implementation: backend build, 123 backend unit tests, disposable PostgreSQL migration/CLI test, mobile typecheck, iOS export, and eight new mobile identity/API tests passed. The full mobile suite has one pre-existing Xcode Run scheme failure (Release vs expected Debug); the other 31 tests pass. Live Spotify album and artist searches succeeded with the configured backend credentials. No production migration, mapping apply, deployment, or VM shutdown was performed.

## Rollback and unchanged data

Set `MUSIC_METADATA_PROVIDER=musicbrainz`, restore/start the VM if paused, and restart the backend. Existing MB release-group mappings route back to the retained provider. Known release-only mappings resolve their group through MusicBrainz only after that provider is selected. Spotify-only records retain their saved metadata; they require separately reviewed MusicBrainz mappings for full MB tracks/catalog support.

Keep Spotify mappings and the additive schema in place. Do not run destructive down migrations or clear provider ID columns. Existing MusicBrainz implementation, original provider IDs/snapshots, review content, list arrays, backlog/favorites membership, curated recent-release data, and billing/authentication logic are preserved.

Spotify references: [client credentials](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow), [display and attribution guidelines](https://developer.spotify.com/documentation/design), [2026 API migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
