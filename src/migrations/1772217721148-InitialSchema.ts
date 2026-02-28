import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1772217721148 implements MigrationInterface {
    name = 'InitialSchema1772217721148'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" ADD "firebaseUid" character varying(128)`);
        await queryRunner.query(`ALTER TABLE "album_lists" ADD "firebaseUid" character varying(128)`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "userId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "album_lists" DROP COLUMN "ownerId"`);
        await queryRunner.query(`ALTER TABLE "album_lists" ADD "ownerId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "album_lists" DROP COLUMN "editorIds"`);
        await queryRunner.query(`ALTER TABLE "album_lists" ADD "editorIds" character varying array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2dc6d909e0514b7046915f80d3" ON "reviews" ("userId", "releaseGroupMbId") WHERE "isDraft" = false`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3bff39f50af4abc7f23b675690" ON "album_lists" ("ownerId", "slug") `);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "album_lists" ADD CONSTRAINT "FK_716ffb90504bd1a8178808a28ff" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "album_lists" DROP CONSTRAINT "FK_716ffb90504bd1a8178808a28ff"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bff39f50af4abc7f23b675690"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2dc6d909e0514b7046915f80d3"`);
        await queryRunner.query(`ALTER TABLE "album_lists" DROP COLUMN "editorIds"`);
        await queryRunner.query(`ALTER TABLE "album_lists" ADD "editorIds" character varying(128) array`);
        await queryRunner.query(`ALTER TABLE "album_lists" DROP COLUMN "ownerId"`);
        await queryRunner.query(`ALTER TABLE "album_lists" ADD "ownerId" character varying(128) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "userId" character varying(128) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "album_lists" DROP COLUMN "firebaseUid"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "firebaseUid"`);
    }

}
