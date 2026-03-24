import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserOauthIdUniqueIndex1774600000000 implements MigrationInterface {
    name = "AddUserOauthIdUniqueIndex1774600000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_user_oauthId_unique" ON "user" ("oauthId") WHERE "oauthId" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_user_oauthId_unique"`);
    }
}
