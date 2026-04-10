import { MigrationInterface, QueryRunner } from "typeorm";

export class ModerationReportsAndBlocks1775010000000 implements MigrationInterface {
    name = "ModerationReportsAndBlocks1775010000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."content_reports_targettype_enum" AS ENUM('user', 'review', 'list')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."content_reports_reason_enum" AS ENUM('abuse', 'harassment', 'hate', 'sexual_content', 'spam', 'impersonation', 'self_harm', 'other')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."content_reports_status_enum" AS ENUM('open', 'reviewed', 'actioned', 'dismissed')`,
        );
        await queryRunner.query(
            `CREATE TABLE "user_blocks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "blockerId" uuid NOT NULL, "blockedId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_user_blocks_blocker_blocked" UNIQUE ("blockerId", "blockedId"), CONSTRAINT "PK_user_blocks_id" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_user_blocks_blocker" ON "user_blocks" ("blockerId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_user_blocks_blocked" ON "user_blocks" ("blockedId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "content_reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reporterUserId" uuid NOT NULL, "targetType" "public"."content_reports_targettype_enum" NOT NULL, "targetId" uuid NOT NULL, "reason" "public"."content_reports_reason_enum" NOT NULL DEFAULT 'other', "details" text, "status" "public"."content_reports_status_enum" NOT NULL DEFAULT 'open', "reviewedByUserId" uuid, "reviewNotes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_content_reports_id" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_content_reports_status_created_at" ON "content_reports" ("status", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_content_reports_target" ON "content_reports" ("targetType", "targetId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_content_reports_reporter" ON "content_reports" ("reporterUserId", "createdAt") `,
        );
        await queryRunner.query(
            `ALTER TABLE "user_blocks" ADD CONSTRAINT "FK_user_blocks_blocker" FOREIGN KEY ("blockerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_blocks" ADD CONSTRAINT "FK_user_blocks_blocked" FOREIGN KEY ("blockedId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "content_reports" ADD CONSTRAINT "FK_content_reports_reporter" FOREIGN KEY ("reporterUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "content_reports" ADD CONSTRAINT "FK_content_reports_reviewer" FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "content_reports" DROP CONSTRAINT "FK_content_reports_reviewer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "content_reports" DROP CONSTRAINT "FK_content_reports_reporter"`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_blocks" DROP CONSTRAINT "FK_user_blocks_blocked"`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_blocks" DROP CONSTRAINT "FK_user_blocks_blocker"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_content_reports_reporter"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_content_reports_target"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_content_reports_status_created_at"`,
        );
        await queryRunner.query(`DROP TABLE "content_reports"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_user_blocks_blocked"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_user_blocks_blocker"`,
        );
        await queryRunner.query(`DROP TABLE "user_blocks"`);
        await queryRunner.query(`DROP TYPE "public"."content_reports_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."content_reports_reason_enum"`);
        await queryRunner.query(`DROP TYPE "public"."content_reports_targettype_enum"`);
    }
}
