import { MigrationInterface, QueryRunner } from "typeorm";

export class AddListLikesTable1773060000000 implements MigrationInterface {
    name = "AddListLikesTable1773060000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "list_likes" (
                "userId" uuid NOT NULL,
                "listId" uuid NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_list_likes_user_list" PRIMARY KEY ("userId", "listId"),
                CONSTRAINT "FK_list_likes_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                CONSTRAINT "FK_list_likes_list" FOREIGN KEY ("listId") REFERENCES "album_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "IDX_list_likes_userId" ON "list_likes" ("userId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_list_likes_listId" ON "list_likes" ("listId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_list_likes_listId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_list_likes_userId"`);
        await queryRunner.query(`DROP TABLE "list_likes"`);
    }
}
