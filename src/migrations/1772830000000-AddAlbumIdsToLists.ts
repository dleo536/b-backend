import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAlbumIdsToLists1772830000000 implements MigrationInterface {
    name = "AddAlbumIdsToLists1772830000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "album_lists" ADD "albumIds" character varying array NOT NULL DEFAULT '{}'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "album_lists" DROP COLUMN "albumIds"`);
    }
}
