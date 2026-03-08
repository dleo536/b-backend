import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserFollowsTable1772900000000 implements MigrationInterface {
    name = "AddUserFollowsTable1772900000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user_follows" (
                "followerId" uuid NOT NULL,
                "followingId" uuid NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_follows_follower_following" PRIMARY KEY ("followerId", "followingId"),
                CONSTRAINT "FK_user_follows_follower" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                CONSTRAINT "FK_user_follows_following" FOREIGN KEY ("followingId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "IDX_user_follows_followerId" ON "user_follows" ("followerId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_user_follows_followingId" ON "user_follows" ("followingId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_user_follows_followingId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_follows_followerId"`);
        await queryRunner.query(`DROP TABLE "user_follows"`);
    }
}
