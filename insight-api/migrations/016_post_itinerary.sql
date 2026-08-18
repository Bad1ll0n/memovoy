-- Link posts to itineraries (optional)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_itinerary_id ON posts (itinerary_id);
