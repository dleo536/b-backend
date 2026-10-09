import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlbumRepairAudit1791504000000 implements MigrationInterface {
  name = 'AddAlbumRepairAudit1791504000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "list_album_repairs" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "actorUserId" uuid NOT NULL,
      "actorFirebaseUid" varchar(128) NOT NULL,
      "listId" uuid NOT NULL,
      "originalAlbumId" varchar(64) NOT NULL,
      "spotifyAlbumId" varchar(64) NOT NULL,
      "reason" text NOT NULL,
      "previewFingerprint" varchar(64) NOT NULL,
      "beforeJson" jsonb NOT NULL,
      "afterJson" jsonb NOT NULL,
      "undoneAt" timestamptz,
      "undoneByUserId" uuid,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_list_album_repairs_list" ON "list_album_repairs" ("listId", "createdAt")`,
    );
  }
  async down(): Promise<void> {
    throw new Error(
      'Repair audit history is retained. Disable moderator access instead of dropping audit data.',
    );
  }
}
