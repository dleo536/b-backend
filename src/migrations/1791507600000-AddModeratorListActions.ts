import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModeratorListActions1791507600000
  implements MigrationInterface
{
  name = 'AddModeratorListActions1791507600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "list_moderator_actions" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "actorUserId" uuid NOT NULL,
      "actorFirebaseUid" varchar(128) NOT NULL,
      "listId" uuid NOT NULL,
      "action" varchar(32) NOT NULL,
      "beforeAlbumIds" varchar[] NOT NULL,
      "afterAlbumIds" varchar[] NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_list_moderator_actions_list" ON "list_moderator_actions" ("listId", "createdAt")',
    );
  }
  async down(): Promise<void> {
    throw new Error(
      'Moderator history is retained. Disable moderator access instead of dropping audit data.',
    );
  }
}
