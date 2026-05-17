import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStructuredUserLocationFields1776553200000
  implements MigrationInterface
{
  name = 'AddStructuredUserLocationFields1776553200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "countryCode" character varying(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "regionName" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "latitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "longitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "locationSource" character varying(16)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "locationSource"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "latitude"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "regionName"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "countryCode"`);
  }
}
