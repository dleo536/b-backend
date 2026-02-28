-- SIMPLER Migration script - tries the most common case first
-- Based on your error, the columns are likely "userId" (camelCase, quoted)

BEGIN;

-- Step 1: Drop all foreign key constraints on reviews
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'reviews'::regclass
        AND contype = 'f'
    ) LOOP
        EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

-- Step 1: Convert reviews."userId" from UUID to VARCHAR
ALTER TABLE reviews ADD COLUMN userid_temp VARCHAR(128);

-- Try camelCase first (most likely based on error message)
DO $$
BEGIN
    UPDATE reviews SET userid_temp = "userId"::text;
    ALTER TABLE reviews DROP COLUMN "userId";
EXCEPTION
    WHEN undefined_column THEN
        -- If that fails, try lowercase
        UPDATE reviews SET userid_temp = userid::text;
        ALTER TABLE reviews DROP COLUMN userid;
END $$;

ALTER TABLE reviews RENAME COLUMN userid_temp TO userid;
ALTER TABLE reviews ALTER COLUMN userid SET NOT NULL;

-- Step 2: Drop all foreign key constraints on album_lists
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'album_lists'::regclass
        AND contype = 'f'
    ) LOOP
        EXECUTE format('ALTER TABLE album_lists DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

-- Step 2: Convert album_lists."ownerId" from UUID to VARCHAR
ALTER TABLE album_lists ADD COLUMN ownerid_temp VARCHAR(128);

DO $$
BEGIN
    UPDATE album_lists SET ownerid_temp = "ownerId"::text;
    ALTER TABLE album_lists DROP COLUMN "ownerId";
EXCEPTION
    WHEN undefined_column THEN
        UPDATE album_lists SET ownerid_temp = ownerid::text;
        ALTER TABLE album_lists DROP COLUMN ownerid;
END $$;

ALTER TABLE album_lists RENAME COLUMN ownerid_temp TO ownerid;
ALTER TABLE album_lists ALTER COLUMN ownerid SET NOT NULL;

-- Step 3: Convert album_lists."editorIds" from UUID[] to VARCHAR[]
ALTER TABLE album_lists ADD COLUMN editorids_temp VARCHAR(128)[];

DO $$
BEGIN
    UPDATE album_lists SET editorids_temp = ARRAY(SELECT unnest("editorIds")::text) 
    WHERE "editorIds" IS NOT NULL AND array_length("editorIds", 1) > 0;
    UPDATE album_lists SET editorids_temp = '{}' 
    WHERE "editorIds" IS NULL OR array_length("editorIds", 1) IS NULL;
    ALTER TABLE album_lists DROP COLUMN "editorIds";
EXCEPTION
    WHEN undefined_column THEN
        UPDATE album_lists SET editorids_temp = ARRAY(SELECT unnest(editorids)::text) 
        WHERE editorids IS NOT NULL AND array_length(editorids, 1) > 0;
        UPDATE album_lists SET editorids_temp = '{}' 
        WHERE editorids IS NULL OR array_length(editorids, 1) IS NULL;
        ALTER TABLE album_lists DROP COLUMN editorids;
END $$;

ALTER TABLE album_lists RENAME COLUMN editorids_temp TO editorids;

COMMIT;

-- After running this script, restart your NestJS app
-- TypeORM will recreate the foreign key constraints automatically

