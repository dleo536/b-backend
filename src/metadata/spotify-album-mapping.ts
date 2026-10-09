import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { isMbid } from './metadata-catalog.service';

export type MappingAlbum = {
  legacyAlbumId?: string;
  localAlbumId: string;
  musicbrainzReleaseGroupId: string | null;
  musicbrainzReleaseId: string | null;
  musicbrainzArtistId: string | null;
  currentTitle: string | null;
  currentArtistName: string | null;
  currentYear: number | null;
  currentAlbumType: string | null;
};
export type AlbumMatch = MappingAlbum & {
  spotifyAlbumId: string | null;
  spotifyAlbumName: string | null;
  spotifyArtistId: string | null;
  spotifyArtistName: string | null;
  spotifyReleaseDate: string | null;
  spotifyAlbumUrl: string | null;
  spotifyArtistUrl: string | null;
  spotifyImageUrl: string | null;
  confidence: number;
  matchReasons: string[];
  status: 'pending' | 'auto_applied' | 'rejected' | 'manually_approved';
  alternatives?: Array<{ spotifyAlbumId: string; confidence: number }>;
};

export const normalizeMatchText = (value?: string | null) =>
  (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const similarity = (left?: string | null, right?: string | null) => {
  const a = normalizeMatchText(left);
  const b = normalizeMatchText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = new Set(a.split(' '));
  const bb = new Set(b.split(' '));
  return (
    (2 * [...aa].filter((word) => bb.has(word)).length) / (aa.size + bb.size)
  );
};
const versionTags = (title?: string | null) =>
  normalizeMatchText(title)
    .split(' ')
    .filter((word) =>
      [
        'deluxe',
        'remastered',
        'remaster',
        'anniversary',
        'live',
        'expanded',
        'instrumental',
        'edition',
        'mono',
        'stereo',
        'karaoke',
      ].includes(word),
    )
    .sort()
    .join(' ');

export function scoreSpotifyAlbum(
  album: MappingAlbum,
  candidate: any,
  market?: string,
): AlbumMatch {
  const title = similarity(album.currentTitle, candidate.name);
  const artist = similarity(
    album.currentArtistName,
    candidate.artists?.[0]?.name,
  );
  const year = Number(candidate.release_date?.slice(0, 4)) || null;
  const delta =
    album.currentYear && year ? Math.abs(album.currentYear - year) : null;
  const reasons = [
    `title_similarity=${title.toFixed(3)}`,
    `primary_artist_similarity=${artist.toFixed(3)}`,
    delta === null ? 'release_year_unknown' : `release_year_delta=${delta}`,
  ];
  let score =
    title * 0.5 +
    artist * 0.35 +
    (delta === null ? 0.05 : delta === 0 ? 0.1 : delta === 1 ? 0.06 : 0);
  const expectedType = album.currentAlbumType?.toLowerCase();
  const actualType = candidate.album_type?.toLowerCase();
  score +=
    !expectedType || !actualType
      ? 0.025
      : expectedType === actualType
        ? 0.05
        : 0;
  reasons.push(
    !expectedType || !actualType
      ? 'album_type_unknown'
      : expectedType === actualType
        ? 'album_type_match'
        : 'album_type_mismatch',
  );
  if (title < 0.95 || artist < 0.95) score = Math.min(score, 0.85);
  if (delta !== null && delta > 1) score = Math.min(score, 0.84);
  if (expectedType && actualType && expectedType !== actualType)
    score = Math.min(score, 0.84);
  if (versionTags(album.currentTitle) !== versionTags(candidate.name)) {
    score = Math.min(score, 0.8);
    reasons.push('edition_or_version_mismatch');
  }
  if (
    market &&
    Array.isArray(candidate.available_markets) &&
    !candidate.available_markets.includes(market)
  ) {
    score = Math.min(score, 0.5);
    reasons.push(`unavailable_in_market=${market}`);
  } else if (
    candidate.is_playable === false ||
    candidate.restrictions?.reason === 'market'
  ) {
    score = Math.min(score, 0.5);
    reasons.push('spotify_candidate_not_playable_in_market');
  } else reasons.push(market ? `market=${market}` : 'market_not_requested');
  return {
    ...album,
    spotifyAlbumId: candidate.id || null,
    spotifyAlbumName: candidate.name || null,
    spotifyArtistId: candidate.artists?.[0]?.id || null,
    spotifyArtistName: candidate.artists?.[0]?.name || null,
    spotifyReleaseDate: candidate.release_date || null,
    spotifyAlbumUrl:
      candidate.external_urls?.spotify ||
      (candidate.id ? `https://open.spotify.com/album/${candidate.id}` : null),
    spotifyArtistUrl:
      candidate.artists?.[0]?.external_urls?.spotify ||
      (candidate.artists?.[0]?.id
        ? `https://open.spotify.com/artist/${candidate.artists[0].id}`
        : null),
    spotifyImageUrl: candidate.images?.[0]?.url || null,
    confidence: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000,
    matchReasons: reasons,
    status: 'pending',
  };
}

export function rankSpotifyAlbums(
  album: MappingAlbum,
  candidates: any[],
  market?: string,
): AlbumMatch {
  const unique = [
    ...new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    ).values(),
  ];
  const ranked = unique
    .map((candidate) => scoreSpotifyAlbum(album, candidate, market))
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        (a.spotifyAlbumId || '').localeCompare(b.spotifyAlbumId || ''),
    );
  if (!ranked.length)
    return {
      ...scoreSpotifyAlbum(album, {}, market),
      confidence: 0,
      matchReasons: ['no_spotify_candidates'],
    };
  const best = ranked[0];
  best.alternatives = ranked
    .slice(1, 6)
    .map((item) => ({
      spotifyAlbumId: item.spotifyAlbumId!,
      confidence: item.confidence,
    }));
  if (ranked[1] && best.confidence - ranked[1].confidence < 0.05) {
    best.confidence = Math.min(best.confidence, 0.89);
    best.matchReasons.push('ambiguous_candidates_require_manual_review');
  }
  return best;
}

export const albumSourceKey = (album: MappingAlbum) =>
  album.musicbrainzReleaseGroupId ||
  album.musicbrainzReleaseId ||
  album.legacyAlbumId!;
export const albumSourceFingerprint = (album: MappingAlbum) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        album.musicbrainzReleaseGroupId,
        album.musicbrainzReleaseId,
        album.musicbrainzArtistId,
        album.legacyAlbumId,
        album.currentTitle,
        album.currentArtistName,
        album.currentYear,
        album.currentAlbumType,
      ]),
    )
    .digest('hex');

// No MusicBrainz requests. Missing list-only snapshots are reported for manual review.
export async function readMappingInventory(
  manager: EntityManager,
): Promise<MappingAlbum[]> {
  const catalog = await manager.query(
    `SELECT * FROM "metadata_albums" WHERE "spotifyAlbumId" IS NULL AND ("musicbrainzReleaseGroupId" IS NOT NULL OR "musicbrainzReleaseId" IS NOT NULL)`,
  );
  const reviews = await manager.query(
    `SELECT "albumId", "releaseGroupMbId", "releaseMbId", "artistMbId", "albumTitleSnapshot", "artistNameSnapshot" FROM "reviews" WHERE "releaseGroupMbId" IS NOT NULL ORDER BY "createdAt" ASC`,
  );
  const lists = await manager.query(
    `SELECT DISTINCT unnest("albumIds") AS "albumId" FROM "album_lists"`,
  );
  const mapped = await manager.query(
    `SELECT "musicbrainzReleaseGroupId", "musicbrainzReleaseId" FROM "metadata_albums" WHERE "spotifyAlbumId" IS NOT NULL`,
  );
  const alreadyMapped = new Set(
    mapped.flatMap((row: any) =>
      [row.musicbrainzReleaseGroupId, row.musicbrainzReleaseId].filter(Boolean),
    ),
  );
  const albums = new Map<string, MappingAlbum>();
  for (const row of catalog) {
    const album: MappingAlbum = {
      localAlbumId: row.id,
      musicbrainzReleaseGroupId: row.musicbrainzReleaseGroupId,
      musicbrainzReleaseId: row.musicbrainzReleaseId,
      musicbrainzArtistId: row.musicbrainzArtistId,
      currentTitle: row.title,
      currentArtistName: row.artistName,
      currentYear: row.releaseYear,
      currentAlbumType: row.albumType,
    };
    albums.set(albumSourceKey(album), album);
  }
  for (const row of reviews) {
    if (
      !isMbid(row.releaseGroupMbId) ||
      alreadyMapped.has(row.releaseGroupMbId)
    )
      continue;
    const existing = albums.get(row.releaseGroupMbId);
    if (!existing)
      albums.set(row.releaseGroupMbId, {
        localAlbumId: row.albumId || randomUUID(),
        musicbrainzReleaseGroupId: row.releaseGroupMbId,
        musicbrainzReleaseId: row.releaseMbId || null,
        musicbrainzArtistId: row.artistMbId || null,
        currentTitle: row.albumTitleSnapshot || null,
        currentArtistName: row.artistNameSnapshot || null,
        currentYear: null,
        currentAlbumType: null,
      });
    else {
      existing.currentTitle ||= row.albumTitleSnapshot || null;
      existing.currentArtistName ||= row.artistNameSnapshot || null;
    }
  }
  for (const row of lists) {
    if (
      !isMbid(row.albumId) ||
      albums.has(row.albumId) ||
      alreadyMapped.has(row.albumId)
    )
      continue;
    // Untyped list UUIDs can be release, release-group, or local IDs. Never guess.
    if (
      [...albums.values()].some(
        (album) =>
          album.musicbrainzReleaseId === row.albumId ||
          album.localAlbumId === row.albumId,
      )
    )
      continue;
    albums.set(row.albumId, {
      legacyAlbumId: row.albumId,
      localAlbumId: randomUUID(),
      musicbrainzReleaseGroupId: null,
      musicbrainzReleaseId: null,
      musicbrainzArtistId: null,
      currentTitle: null,
      currentArtistName: null,
      currentYear: null,
      currentAlbumType: null,
    });
  }
  return [...albums.values()].sort((a, b) =>
    albumSourceKey(a).localeCompare(albumSourceKey(b)),
  );
}

export async function applyAlbumMatch(
  manager: EntityManager,
  match: AlbumMatch,
  spotifyAlbum: any,
  spotifyArtist?: any,
) {
  if (!match.spotifyAlbumId) throw new Error('Mapping has no Spotify album ID');
  if (!match.musicbrainzReleaseGroupId && !match.musicbrainzReleaseId)
    throw new Error(
      'Untyped legacy IDs require manual identification before mapping',
    );
  const existing = await manager.query(
    `SELECT * FROM "metadata_albums" WHERE "id" = $1 OR "musicbrainzReleaseGroupId" = $2 OR "musicbrainzReleaseId" = $3 OR "spotifyAlbumId" = $4 FOR UPDATE`,
    [
      match.localAlbumId,
      match.musicbrainzReleaseGroupId,
      match.musicbrainzReleaseId,
      match.spotifyAlbumId,
    ],
  );
  if (
    existing.some(
      (row: any) =>
        (row.spotifyAlbumId && row.spotifyAlbumId !== match.spotifyAlbumId) ||
        (row.musicbrainzReleaseGroupId &&
          row.musicbrainzReleaseGroupId !== match.musicbrainzReleaseGroupId) ||
        (row.musicbrainzReleaseId &&
          row.musicbrainzReleaseId !== match.musicbrainzReleaseId) ||
        row.id !== match.localAlbumId,
    )
  )
    throw new Error(
      'Mapping conflicts with an existing catalog identity; no rows changed',
    );
  const conflictingReviews = await manager.query(
    `SELECT "id" FROM "reviews" WHERE "releaseGroupMbId" = $1 AND (("spotifyAlbumId" IS NOT NULL AND "spotifyAlbumId" <> $2) OR ("albumId" IS NOT NULL AND "albumId" <> $3))`,
    [match.musicbrainzReleaseGroupId, match.spotifyAlbumId, match.localAlbumId],
  );
  if (conflictingReviews.length)
    throw new Error(
      'Review has a conflicting provider identity; no rows changed',
    );
  const artistId = match.spotifyArtistId;
  if (artistId) {
    const artists = await manager.query(
      `SELECT * FROM "metadata_artists" WHERE "spotifyArtistId" = $1 OR "musicbrainzArtistId" = $2 FOR UPDATE`,
      [artistId, match.musicbrainzArtistId],
    );
    if (
      artists.length > 1 ||
      artists.some(
        (artist: any) =>
          (artist.spotifyArtistId && artist.spotifyArtistId !== artistId) ||
          (artist.musicbrainzArtistId &&
            match.musicbrainzArtistId &&
            artist.musicbrainzArtistId !== match.musicbrainzArtistId),
      )
    )
      throw new Error('Artist mapping conflicts; no rows changed');
    if (!artists.length)
      await manager.query(
        `INSERT INTO "metadata_artists" ("musicbrainzArtistId", "spotifyArtistId", "name", "spotifyArtistUrl", "metadataProvider", "metadataMatchConfidence", "spotifyFetchedAt", "spotifyImageUrl", "spotifySnapshot") VALUES ($1,$2,$3,$4,'spotify',$5,now(),$6,$7::jsonb)`,
        [
          match.musicbrainzArtistId,
          artistId,
          match.spotifyArtistName,
          match.spotifyArtistUrl,
          match.confidence,
          spotifyArtist?.images?.[0]?.url || null,
          JSON.stringify(spotifyArtist || null),
        ],
      );
    else
      await manager.query(
        `UPDATE "metadata_artists" SET "spotifyArtistId"=$2, "spotifyArtistUrl"=$3, "spotifyFetchedAt"=now(), "metadataProvider"='spotify', "metadataMatchConfidence"=$4, "musicbrainzArtistId"=COALESCE("musicbrainzArtistId",$5), "spotifyImageUrl"=COALESCE($6,"spotifyImageUrl"), "spotifySnapshot"=COALESCE($7::jsonb,"spotifySnapshot"), "updatedAt"=now() WHERE "id"=$1`,
        [
          artists[0].id,
          artistId,
          match.spotifyArtistUrl,
          match.confidence,
          match.musicbrainzArtistId,
          spotifyArtist?.images?.[0]?.url || null,
          spotifyArtist ? JSON.stringify(spotifyArtist) : null,
        ],
      );
  }
  if (!existing.length)
    await manager.query(
      `INSERT INTO "metadata_albums" ("id", "musicbrainzReleaseGroupId", "musicbrainzReleaseId", "musicbrainzArtistId", "title", "artistName", "releaseYear", "albumType") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        match.localAlbumId,
        match.musicbrainzReleaseGroupId,
        match.musicbrainzReleaseId,
        match.musicbrainzArtistId,
        match.currentTitle,
        match.currentArtistName,
        match.currentYear,
        match.currentAlbumType,
      ],
    );
  await manager.query(
    `UPDATE "metadata_albums" SET "spotifyAlbumId"=$2, "spotifyArtistId"=$3, "spotifyAlbumUrl"=$4, "spotifyArtistUrl"=$5, "spotifyImageUrl"=$6, "spotifyFetchedAt"=now(), "metadataProvider"='spotify', "metadataMatchConfidence"=$7, "spotifySnapshot"=$8::jsonb, "updatedAt"=now() WHERE "id"=$1 AND ("spotifyAlbumId" IS NULL OR "spotifyAlbumId"=$2)`,
    [
      match.localAlbumId,
      match.spotifyAlbumId,
      artistId,
      match.spotifyAlbumUrl,
      match.spotifyArtistUrl,
      match.spotifyImageUrl,
      match.confidence,
      JSON.stringify(spotifyAlbum),
    ],
  );
  // Preserve every MusicBrainz key, snapshot, review body, and list array.
  await manager.query(
    `UPDATE "reviews" SET "spotifyAlbumId"=COALESCE("spotifyAlbumId",$2), "albumId"=COALESCE("albumId",$3) WHERE "releaseGroupMbId"=$1`,
    [match.musicbrainzReleaseGroupId, match.spotifyAlbumId, match.localAlbumId],
  );
}
