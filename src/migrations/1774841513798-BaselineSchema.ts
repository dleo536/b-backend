import { MigrationInterface, QueryRunner } from "typeorm";

export class BaselineSchema1774841513798 implements MigrationInterface {
    name = 'BaselineSchema1774841513798'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."reviews_visibility_enum" AS ENUM('public', 'friends', 'private')`);
        await queryRunner.query(`CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "firebaseUid" character varying(128), "albumId" uuid, "releaseGroupMbId" character varying(36) NOT NULL, "releaseMbId" character varying(36), "artistMbId" character varying(36), "spotifyAlbumId" character varying(64), "discogsMasterId" character varying(64), "albumTitleSnapshot" character varying(512) NOT NULL, "artistNameSnapshot" character varying(512) NOT NULL, "coverUrlSnapshot" text, "ratingHalfSteps" numeric(3,1), "headline" character varying(140), "body" text, "isSpoiler" boolean NOT NULL DEFAULT false, "isDraft" boolean NOT NULL DEFAULT false, "visibility" "public"."reviews_visibility_enum" NOT NULL DEFAULT 'public', "tags" text array NOT NULL DEFAULT '{}', "trackHighlights" jsonb, "likesCount" integer NOT NULL DEFAULT '0', "commentsCount" integer NOT NULL DEFAULT '0', "listenedOn" date, "relistenCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "publishedAt" TIMESTAMP WITH TIME ZONE, "deletedAt" TIMESTAMP, CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_review_visibility" ON "reviews" ("visibility") `);
        await queryRunner.query(`CREATE INDEX "idx_review_album_lookup" ON "reviews" ("releaseGroupMbId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2dc6d909e0514b7046915f80d3" ON "reviews" ("userId", "releaseGroupMbId") WHERE "isDraft" = false`);
        await queryRunner.query(`CREATE TYPE "public"."user_authprovider_enum" AS ENUM('local', 'google', 'apple', 'github', 'spotify')`);
        await queryRunner.query(`CREATE TYPE "public"."user_profilevisibility_enum" AS ENUM('public', 'friends', 'private')`);
        await queryRunner.query(`CREATE TYPE "public"."user_roles_enum" AS ENUM('user', 'mod', 'admin')`);
        await queryRunner.query(`CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(64) NOT NULL, "usernameLower" character varying(64) NOT NULL, "displayName" character varying(120), "email" character varying(255), "emailLower" character varying(255), "passwordHash" character varying(255), "authProvider" "public"."user_authprovider_enum" NOT NULL DEFAULT 'local', "oauthId" character varying(191), "emailVerifiedAt" TIMESTAMP WITH TIME ZONE, "lastLoginAt" TIMESTAMP WITH TIME ZONE, "bio" text, "avatarUrl" character varying(255), "bannerUrl" character varying(255), "location" character varying(120), "websiteUrl" character varying(255), "externalIds" jsonb NOT NULL DEFAULT '{}', "preferences" jsonb NOT NULL DEFAULT '{"theme":"system","ratingScale":"HALF_STARS","defaultReviewVisibility":"public","showListeningActivity":true,"allowCommentsFrom":"everyone"}', "profileVisibility" "public"."user_profilevisibility_enum" NOT NULL DEFAULT 'public', "roles" "public"."user_roles_enum" array NOT NULL DEFAULT '{user}', "isSuspended" boolean NOT NULL DEFAULT false, "suspendReason" text, "favoriteGenres" text array NOT NULL DEFAULT '{}', "favoriteArtists" text array NOT NULL DEFAULT '{}', "followersCount" integer NOT NULL DEFAULT '0', "followingCount" integer NOT NULL DEFAULT '0', "reviewsCount" integer NOT NULL DEFAULT '0', "likesReceivedCount" integer NOT NULL DEFAULT '0', "isOnboarded" boolean NOT NULL DEFAULT false, "onboardingStep" smallint NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UQ_a27b942a0d6dcff90e3ee9b5e8e" UNIQUE ("usernameLower"), CONSTRAINT "UQ_562834ea51a3ecb0475831f860e" UNIQUE ("emailLower"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e11e649824a45d8ed01d597fd9" ON "user" ("createdAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d1c82fcf193e9c2eb76e6d0ffe" ON "user" ("oauthId") WHERE "oauthId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a27b942a0d6dcff90e3ee9b5e8" ON "user" ("usernameLower") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_562834ea51a3ecb0475831f860" ON "user" ("emailLower") `);
        await queryRunner.query(`CREATE TABLE "user_follows" ("followerId" uuid NOT NULL, "followingId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_48050dfc1d2514f4c2059f155eb" PRIMARY KEY ("followerId", "followingId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_user_follows_followingId" ON "user_follows" ("followingId") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_follows_followerId" ON "user_follows" ("followerId") `);
        await queryRunner.query(`CREATE TYPE "public"."album_lists_listtype_enum" AS ENUM('custom', 'favorites', 'top_n', 'year', 'theme')`);
        await queryRunner.query(`CREATE TYPE "public"."album_lists_visibility_enum" AS ENUM('public', 'friends', 'private')`);
        await queryRunner.query(`CREATE TABLE "album_lists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerId" uuid NOT NULL, "firebaseUid" character varying(128), "title" character varying(120) NOT NULL, "slug" character varying(140) NOT NULL, "listType" "public"."album_lists_listtype_enum" NOT NULL DEFAULT 'custom', "isSystem" boolean NOT NULL DEFAULT false, "visibility" "public"."album_lists_visibility_enum" NOT NULL DEFAULT 'public', "description" text, "albumIds" character varying array NOT NULL DEFAULT '{}', "coverUrl" character varying(255), "isCollaborative" boolean NOT NULL DEFAULT false, "editorIds" character varying array NOT NULL DEFAULT '{}', "isPinned" boolean NOT NULL DEFAULT false, "isLocked" boolean NOT NULL DEFAULT false, "itemsCount" integer NOT NULL DEFAULT '0', "followersCount" integer NOT NULL DEFAULT '0', "likesCount" integer NOT NULL DEFAULT '0', "commentsCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_8b8253f6ef72b04c9e22e01801f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_00a4a4de19131f9cd83ac0e4b9" ON "album_lists" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_dfc5fc6e2f00c857816ff3dd02" ON "album_lists" ("visibility") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3bff39f50af4abc7f23b675690" ON "album_lists" ("ownerId", "slug") `);
        await queryRunner.query(`CREATE TABLE "list_likes" ("userId" uuid NOT NULL, "listId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f6cd4ca11375dd5d4ce7ea40510" PRIMARY KEY ("userId", "listId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_list_likes_listId" ON "list_likes" ("listId") `);
        await queryRunner.query(`CREATE INDEX "IDX_list_likes_userId" ON "list_likes" ("userId") `);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_follows" ADD CONSTRAINT "FK_6300484b604263eaae8a6aab88d" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_follows" ADD CONSTRAINT "FK_7c6c27f12c4e972eab4b3aaccbf" FOREIGN KEY ("followingId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "album_lists" ADD CONSTRAINT "FK_716ffb90504bd1a8178808a28ff" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "list_likes" ADD CONSTRAINT "FK_5d24261158e03bee956bb474a34" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "list_likes" ADD CONSTRAINT "FK_24093bbcc1f5efa9690f7886a63" FOREIGN KEY ("listId") REFERENCES "album_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "list_likes" DROP CONSTRAINT "FK_24093bbcc1f5efa9690f7886a63"`);
        await queryRunner.query(`ALTER TABLE "list_likes" DROP CONSTRAINT "FK_5d24261158e03bee956bb474a34"`);
        await queryRunner.query(`ALTER TABLE "album_lists" DROP CONSTRAINT "FK_716ffb90504bd1a8178808a28ff"`);
        await queryRunner.query(`ALTER TABLE "user_follows" DROP CONSTRAINT "FK_7c6c27f12c4e972eab4b3aaccbf"`);
        await queryRunner.query(`ALTER TABLE "user_follows" DROP CONSTRAINT "FK_6300484b604263eaae8a6aab88d"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_list_likes_userId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_list_likes_listId"`);
        await queryRunner.query(`DROP TABLE "list_likes"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bff39f50af4abc7f23b675690"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dfc5fc6e2f00c857816ff3dd02"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_00a4a4de19131f9cd83ac0e4b9"`);
        await queryRunner.query(`DROP TABLE "album_lists"`);
        await queryRunner.query(`DROP TYPE "public"."album_lists_visibility_enum"`);
        await queryRunner.query(`DROP TYPE "public"."album_lists_listtype_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_follows_followerId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_follows_followingId"`);
        await queryRunner.query(`DROP TABLE "user_follows"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_562834ea51a3ecb0475831f860"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a27b942a0d6dcff90e3ee9b5e8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d1c82fcf193e9c2eb76e6d0ffe"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e11e649824a45d8ed01d597fd9"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP TYPE "public"."user_roles_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_profilevisibility_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_authprovider_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2dc6d909e0514b7046915f80d3"`);
        await queryRunner.query(`DROP INDEX "public"."idx_review_album_lookup"`);
        await queryRunner.query(`DROP INDEX "public"."idx_review_visibility"`);
        await queryRunner.query(`DROP TABLE "reviews"`);
        await queryRunner.query(`DROP TYPE "public"."reviews_visibility_enum"`);
    }

}
