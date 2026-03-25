import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateReviewRatingsToTenPointScale1775200000000 implements MigrationInterface {
    name = "UpdateReviewRatingsToTenPointScale1775200000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "reviews" ALTER COLUMN "ratingHalfSteps" TYPE numeric(3,1) USING "ratingHalfSteps"::numeric(3,1)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "reviews" ALTER COLUMN "ratingHalfSteps" TYPE smallint USING ROUND("ratingHalfSteps")::smallint`,
        );
    }
}
