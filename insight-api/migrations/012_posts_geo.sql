-- Add geolocation coordinates to posts for "near me" discovery
ALTER TABLE posts ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

-- Spatial index via composite — for small datasets (< 1M rows) this is sufficient
-- Use PostGIS for production at scale
CREATE INDEX IF NOT EXISTS idx_posts_lat_lon ON posts (lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;
