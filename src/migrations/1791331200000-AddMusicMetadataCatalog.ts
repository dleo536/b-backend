import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicMetadataCatalog1791331200000
  implements MigrationInterface
{
  name = 'AddMusicMetadataCatalog1791331200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // Schema only: existing identities/snapshots are imported by the reviewed mapping CLI.
    await queryRunner.query(`CREATE TABLE "metadata_artists" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "musicbrainzArtistId" varchar(36) UNIQUE, "spotifyArtistId" varchar(64) UNIQUE,
      "name" text, "spotifyArtistUrl" text, "spotifyImageUrl" text,
      "spotifyFetchedAt" timestamptz, "metadataProvider" varchar(16), "metadataMatchConfidence" double precision,
      "musicbrainzSnapshot" jsonb, "spotifySnapshot" jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE TABLE "metadata_albums" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "musicbrainzReleaseGroupId" varchar(36) UNIQUE, "musicbrainzReleaseId" varchar(36) UNIQUE,
      "musicbrainzArtistId" varchar(36), "spotifyAlbumId" varchar(64) UNIQUE, "spotifyArtistId" varchar(64),
      "spotifyAlbumUrl" text, "spotifyArtistUrl" text, "spotifyImageUrl" text,
      "spotifyFetchedAt" timestamptz, "metadataProvider" varchar(16), "metadataMatchConfidence" double precision,
      "title" text, "artistName" text, "releaseYear" integer, "albumType" varchar(32),
      "musicbrainzSnapshot" jsonb, "spotifySnapshot" jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `ALTER TABLE "reviews" ALTER COLUMN "releaseGroupMbId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_review_spotify_album_published" ON "reviews" ("userId", "spotifyAlbumId") WHERE "isDraft" = false AND "spotifyAlbumId" IS NOT NULL AND "releaseGroupMbId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_spotify_album_lookup" ON "reviews" ("spotifyAlbumId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_local_album_lookup" ON "reviews" ("albumId")`,
    );
  }
  async down(): Promise<void> {
    // Provider rollback is configuration-only. Never erase mappings or Spotify-only reviews.
    throw new Error(
      'This additive migration is intentionally non-destructive. Roll back MUSIC_METADATA_PROVIDER instead.',
    );
  }
}
