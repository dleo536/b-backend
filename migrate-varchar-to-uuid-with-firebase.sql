-- Migration: Convert userId/ownerId back to UUID FK, add firebaseUid columns
-- This migration:
-- 1. Adds firebaseUid columns
-- 2. Copies existing Firebase UIDs from userId/ownerId to firebaseUid
-- 3. Looks up User UUIDs by oauthId (Firebase UID)
-- 4. Updates userId/ownerId with User UUIDs
-- 5. Converts columns back to UUID type

BEGIN;

-- Step 1: Add firebaseUid columns
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "firebaseUid" VARCHAR(128);
ALTER TABLE album_lists ADD COLUMN IF NOT EXISTS "firebaseUid" VARCHAR(128);

-- Step 2: Copy existing Firebase UIDs from userId/ownerId to firebaseUid
-- (Assuming current userId/ownerId contain Firebase UIDs)
UPDATE reviews SET "firebaseUid" = "userId" WHERE "firebaseUid" IS NULL;
UPDATE album_lists SET "firebaseUid" = "ownerId" WHERE "firebaseUid" IS NULL;

-- Step 3: Create temporary UUID columns
ALTER TABLE reviews ADD COLUMN "userId_uuid" UUID;
ALTER TABLE album_lists ADD COLUMN "ownerId_uuid" UUID;

-- Step 4: Look up User UUIDs by oauthId (Firebase UID) and populate temp columns
UPDATE reviews r
SET "userId_uuid" = u.id
FROM "user" u
WHERE u."oauthId" = r."firebaseUid"
AND r."firebaseUid" IS NOT NULL;

UPDATE album_lists al
SET "ownerId_uuid" = u.id
FROM "user" u
WHERE u."oauthId" = al."firebaseUid"
AND al."firebaseUid" IS NOT NULL;

-- Step 5: Drop old columns and rename temp columns
ALTER TABLE reviews DROP COLUMN "userId";
ALTER TABLE reviews RENAME COLUMN "userId_uuid" TO "userId";
ALTER TABLE reviews ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE album_lists DROP COLUMN "ownerId";
ALTER TABLE album_lists RENAME COLUMN "ownerId_uuid" TO "ownerId";
ALTER TABLE album_lists ALTER COLUMN "ownerId" SET NOT NULL;

-- Step 6: Recreate foreign key constraints
ALTER TABLE reviews 
ADD CONSTRAINT "FK_reviews_userId" 
FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE album_lists 
ADD CONSTRAINT "FK_album_lists_ownerId" 
FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON DELETE CASCADE;

COMMIT;

-- Note: If some reviews/lists have firebaseUids that don't match any User.oauthId,
-- those rows will have NULL userId/ownerId. You may need to handle those manually.

