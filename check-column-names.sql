-- Quick diagnostic script to check actual column names in your database
-- Run this first to see what the actual column names are

-- Check reviews table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'reviews' 
AND column_name ILIKE '%userid%'
ORDER BY column_name;

-- Check album_lists table columns  
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'album_lists' 
AND (column_name ILIKE '%ownerid%' OR column_name ILIKE '%editorid%')
ORDER BY column_name;

