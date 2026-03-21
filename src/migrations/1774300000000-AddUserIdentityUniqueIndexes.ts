import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserIdentityUniqueIndexes1774300000000 implements MigrationInterface {
    name = "AddUserIdentityUniqueIndexes1774300000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'user'
                      AND indexdef ILIKE '%UNIQUE%'
                      AND indexdef ILIKE '%("usernameLower")%'
                ) THEN
                    CREATE UNIQUE INDEX "IDX_user_username_lower_unique"
                    ON "user" ("usernameLower");
                END IF;
            END $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'user'
                      AND indexdef ILIKE '%UNIQUE%'
                      AND indexdef ILIKE '%("emailLower")%'
                ) THEN
                    CREATE UNIQUE INDEX "IDX_user_email_lower_unique"
                    ON "user" ("emailLower")
                    WHERE "emailLower" IS NOT NULL;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_email_lower_unique"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_username_lower_unique"`);
    }
}
