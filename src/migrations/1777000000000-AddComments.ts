import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComments1777000000000 implements MigrationInterface {
  name = 'AddComments1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."comments_targettype_enum" AS ENUM('review', 'list')`,
    );
    await queryRunner.query(
      `CREATE TABLE "comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "targetType" "public"."comments_targettype_enum" NOT NULL, "targetId" uuid NOT NULL, "body" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_comments_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comments_target_created_at" ON "comments" ("targetType", "targetId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comments_user_created_at" ON "comments" ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_comments_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_comments_user_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_comments_target_created_at"`);
    await queryRunner.query(`DROP TABLE "comments"`);
    await queryRunner.query(`DROP TYPE "public"."comments_targettype_enum"`);
  }
}
