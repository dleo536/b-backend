import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewLikes1777200000000 implements MigrationInterface {
  name = 'AddReviewLikes1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "review_likes" ("userId" uuid NOT NULL, "reviewId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_review_likes" PRIMARY KEY ("userId", "reviewId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_likes_userId" ON "review_likes" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_likes_reviewId" ON "review_likes" ("reviewId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "review_likes" ADD CONSTRAINT "FK_review_likes_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_likes" ADD CONSTRAINT "FK_review_likes_review" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "review_likes" DROP CONSTRAINT "FK_review_likes_review"`);
    await queryRunner.query(`ALTER TABLE "review_likes" DROP CONSTRAINT "FK_review_likes_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_review_likes_reviewId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_review_likes_userId"`);
    await queryRunner.query(`DROP TABLE "review_likes"`);
  }
}
