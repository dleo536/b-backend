import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecentReleaseAlbums1777100000000
  implements MigrationInterface
{
  name = 'AddRecentReleaseAlbums1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "recent_release_albums" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "spotifyAlbumId" character varying(64) NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "albumSnapshot" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_recent_release_albums_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_recent_release_albums_spotifyAlbumId" ON "recent_release_albums" ("spotifyAlbumId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_recent_release_albums_sort" ON "recent_release_albums" ("sortOrder", "createdAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_recent_release_albums_sort"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_recent_release_albums_spotifyAlbumId"`,
    );
    await queryRunner.query(`DROP TABLE "recent_release_albums"`);
  }
}
