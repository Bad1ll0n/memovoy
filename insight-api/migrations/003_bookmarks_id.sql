ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE bookmarks SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE bookmarks DROP CONSTRAINT IF EXISTS bookmarks_pkey;
ALTER TABLE bookmarks ADD PRIMARY KEY (id);
