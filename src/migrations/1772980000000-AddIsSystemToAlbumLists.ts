import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsSystemToAlbumLists1772980000000 implements MigrationInterface {
    name = "AddIsSystemToAlbumLists1772980000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "album_lists" ADD "isSystem" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(`
            UPDATE "album_lists"
            SET "isSystem" = true
            WHERE LOWER(COALESCE("slug", '')) IN ('backlog', 'favorites')
               OR LOWER(COALESCE("title", '')) IN ('backlog', 'favorites')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "album_lists" DROP COLUMN "isSystem"`);
    }
}
