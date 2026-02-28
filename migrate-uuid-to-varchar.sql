-- Migration script to convert UUID columns to VARCHAR for Firebase UIDs
-- Run this script manually in your PostgreSQL database if you have existing data
-- 
-- IMPORTANT: 
-- 1. Backup your database before running this!
-- 2. First run check-column-names.sql to see your actual column names
-- 
-- To run this script:
-- Option 1 (psql command line):
--   psql -U your_username -d your_database_name -f migrate-uuid-to-varchar.sql
-- 
-- Option 2 (pgAdmin):
--   1. Open pgAdmin
--   2. Connect to your database
--   3. Right-click on your database → Query Tool
--   4. Paste this entire script and click Execute (F5)

BEGIN;

-- Step 1: Convert reviews.userId from UUID to VARCHAR
-- First, find and drop foreign key constraints
DO $$ 
DECLARE
    constraint_name_var TEXT;
BEGIN
    -- Find all foreign key constraints on reviews table
    FOR constraint_name_var IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'reviews'::regclass
        AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT IF EXISTS %I', constraint_name_var);
    END LOOP;
END $$;

-- Find the actual column name and migrate
DO $$
DECLARE
    actual_col_name TEXT;
    col_exists BOOLEAN;
BEGIN
    -- Check if column exists as "userId" (quoted/camelCase) - TypeORM often creates these
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'reviews' 
        AND column_name = 'userId'
    ) INTO col_exists;
    
    -- Add temporary column
    ALTER TABLE reviews ADD COLUMN userid_temp VARCHAR(128);
    
    -- Copy data - try camelCase first (quoted), then lowercase
    IF col_exists THEN
        -- Column is "userId" (camelCase, needs quotes)
        EXECUTE 'UPDATE reviews SET userid_temp = "userId"::text';
        EXECUTE 'ALTER TABLE reviews DROP COLUMN "userId"';
    ELSE
        -- Column is "userid" (lowercase)
        EXECUTE 'UPDATE reviews SET userid_temp = userid::text';
        EXECUTE 'ALTER TABLE reviews DROP COLUMN userid';
    END IF;
    
    -- Rename and set NOT NULL
    ALTER TABLE reviews RENAME COLUMN userid_temp TO userid;
    ALTER TABLE reviews ALTER COLUMN userid SET NOT NULL;
EXCEPTION
    WHEN undefined_column THEN
        -- If userid doesn't exist, try userId
        BEGIN
            EXECUTE 'UPDATE reviews SET userid_temp = "userId"::text';
            EXECUTE 'ALTER TABLE reviews DROP COLUMN "userId"';
            ALTER TABLE reviews RENAME COLUMN userid_temp TO userid;
            ALTER TABLE reviews ALTER COLUMN userid SET NOT NULL;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Could not find userId or userid column in reviews table';
        END;
END $$;

-- Step 2: Convert album_lists.ownerId from UUID to VARCHAR
-- Drop foreign key constraint if it exists
DO $$ 
DECLARE
    constraint_name_var TEXT;
    actual_col_name TEXT;
BEGIN
    -- Find all foreign key constraints on album_lists table
    FOR constraint_name_var IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'album_lists'::regclass
        AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE album_lists DROP CONSTRAINT IF EXISTS %I', constraint_name_var);
    END LOOP;
    
    -- Find the actual column name
    SELECT column_name INTO actual_col_name
    FROM information_schema.columns
    WHERE table_name = 'album_lists' 
    AND column_name IN ('ownerId', 'ownerid', '"ownerId"')
    LIMIT 1;
    
    IF actual_col_name IS NULL THEN
        SELECT column_name INTO actual_col_name
        FROM information_schema.columns
        WHERE table_name = 'album_lists' 
        AND LOWER(column_name) = 'ownerid'
        LIMIT 1;
    END IF;
    
    -- Add temporary column
    EXECUTE 'ALTER TABLE album_lists ADD COLUMN ownerid_temp VARCHAR(128)';
    
    -- Copy data using the actual column name
    IF actual_col_name = 'ownerId' OR actual_col_name = '"ownerId"' THEN
        EXECUTE 'UPDATE album_lists SET ownerid_temp = "ownerId"::text';
        EXECUTE 'ALTER TABLE album_lists DROP COLUMN "ownerId"';
    ELSE
        EXECUTE 'UPDATE album_lists SET ownerid_temp = ownerid::text';
        EXECUTE 'ALTER TABLE album_lists DROP COLUMN ownerid';
    END IF;
    
    -- Rename and set NOT NULL
    EXECUTE 'ALTER TABLE album_lists RENAME COLUMN ownerid_temp TO ownerid';
    EXECUTE 'ALTER TABLE album_lists ALTER COLUMN ownerid SET NOT NULL';
END $$;

-- Step 3: Convert album_lists.editorIds from UUID[] to VARCHAR[]
DO $$
DECLARE
    actual_col_name TEXT;
BEGIN
    -- Find the actual column name
    SELECT column_name INTO actual_col_name
    FROM information_schema.columns
    WHERE table_name = 'album_lists' 
    AND column_name IN ('editorIds', 'editorids', '"editorIds"')
    LIMIT 1;
    
    IF actual_col_name IS NULL THEN
        SELECT column_name INTO actual_col_name
        FROM information_schema.columns
        WHERE table_name = 'album_lists' 
        AND LOWER(column_name) = 'editorids'
        LIMIT 1;
    END IF;
    
    -- Add temporary column
    EXECUTE 'ALTER TABLE album_lists ADD COLUMN editorids_temp VARCHAR(128)[]';
    
    -- Copy data using the actual column name
    IF actual_col_name = 'editorIds' OR actual_col_name = '"editorIds"' THEN
        EXECUTE 'UPDATE album_lists SET editorids_temp = ARRAY(SELECT unnest("editorIds")::text) WHERE "editorIds" IS NOT NULL AND array_length("editorIds", 1) > 0';
        EXECUTE 'UPDATE album_lists SET editorids_temp = ''{}'' WHERE "editorIds" IS NULL OR array_length("editorIds", 1) IS NULL';
        EXECUTE 'ALTER TABLE album_lists DROP COLUMN "editorIds"';
    ELSE
        EXECUTE 'UPDATE album_lists SET editorids_temp = ARRAY(SELECT unnest(editorids)::text) WHERE editorids IS NOT NULL AND array_length(editorids, 1) > 0';
        EXECUTE 'UPDATE album_lists SET editorids_temp = ''{}'' WHERE editorids IS NULL OR array_length(editorids, 1) IS NULL';
        EXECUTE 'ALTER TABLE album_lists DROP COLUMN editorids';
    END IF;
    
    -- Rename
    EXECUTE 'ALTER TABLE album_lists RENAME COLUMN editorids_temp TO editorids';
END $$;

COMMIT;

-- After running this script, restart your NestJS app
-- TypeORM will recreate the foreign key constraints automatically

