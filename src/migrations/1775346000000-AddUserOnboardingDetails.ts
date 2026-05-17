import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserOnboardingDetails1775346000000
  implements MigrationInterface
{
  name = 'AddUserOnboardingDetails1775346000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "dateOfBirth" date`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "country" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "city" character varying(120)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "country"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "dateOfBirth"`);
  }
}
