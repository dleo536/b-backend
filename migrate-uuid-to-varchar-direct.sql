-- DIRECT Migration script - uses camelCase (quoted) column names
-- PostgreSQL requires quotes for camelCase identifiers: "userId", "ownerId", "editorIds"

BEGIN;

-- Step 1: Drop all foreign key constraints
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Drop FK constraints on reviews
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'reviews'::regclass AND contype = 'f'
    ) LOOP
        EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
    
    -- Drop FK constraints on album_lists
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'album_lists'::regclass AND contype = 'f'
    ) LOOP
        EXECUTE format('ALTER TABLE album_lists DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

-- Step 1: Convert reviews."userId" from UUID to VARCHAR (camelCase, quoted)
ALTER TABLE reviews ADD COLUMN "userId_temp" VARCHAR(128);
UPDATE reviews SET "userId_temp" = userid::text;
ALTER TABLE reviews DROP COLUMN userid;
ALTER TABLE reviews RENAME COLUMN "userId_temp" TO "userId";
ALTER TABLE reviews ALTER COLUMN "userId" SET NOT NULL;

-- Step 2: Convert album_lists."ownerId" from UUID to VARCHAR (camelCase, quoted)
ALTER TABLE album_lists ADD COLUMN "ownerId_temp" VARCHAR(128);
UPDATE album_lists SET "ownerId_temp" = ownerid::text;
ALTER TABLE album_lists DROP COLUMN ownerid;
ALTER TABLE album_lists RENAME COLUMN "ownerId_temp" TO "ownerId";
ALTER TABLE album_lists ALTER COLUMN "ownerId" SET NOT NULL;

-- Step 3: Convert album_lists."editorIds" from UUID[] to VARCHAR[] (camelCase, quoted)
ALTER TABLE album_lists ADD COLUMN "editorIds_temp" VARCHAR(128)[];
UPDATE album_lists SET "editorIds_temp" = ARRAY(SELECT unnest(editorids)::text) 
WHERE editorids IS NOT NULL AND array_length(editorids, 1) > 0;
UPDATE album_lists SET "editorIds_temp" = '{}' 
WHERE editorids IS NULL OR array_length(editorids, 1) IS NULL;
ALTER TABLE album_lists DROP COLUMN editorids;
ALTER TABLE album_lists RENAME COLUMN "editorIds_temp" TO "editorIds";

COMMIT;

-- After running this script, restart your NestJS app
-- TypeORM will recreate the foreign key constraints automatically

