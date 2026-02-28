-- Check current column types to verify migration status
-- Run this to see what types your columns currently are

SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('reviews', 'album_lists')
AND column_name IN ('userid', 'userId', 'ownerid', 'ownerId', 'editorids', 'editorIds')
ORDER BY table_name, column_name;

