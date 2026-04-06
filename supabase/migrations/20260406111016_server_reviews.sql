-- Server Reviews Migration

CREATE TABLE IF NOT EXISTS server_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT NOT NULL,
  playtime_hours INTEGER,
  helpful_count INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_server ON server_reviews(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON server_reviews(server_id, rating);

-- View for rating stats
CREATE OR REPLACE VIEW server_rating_stats AS
SELECT 
  server_id,
  COUNT(*) as total_reviews,
  ROUND(AVG(rating), 2) as avg_rating,
  COUNT(*) FILTER (WHERE rating = 5) as five_star,
  COUNT(*) FILTER (WHERE rating = 4) as four_star,
  COUNT(*) FILTER (WHERE rating = 3) as three_star,
  COUNT(*) FILTER (WHERE rating = 2) as two_star,
  COUNT(*) FILTER (WHERE rating = 1) as one_star
FROM server_reviews
GROUP BY server_id;

-- Function for review distribution
CREATE OR REPLACE FUNCTION get_review_distribution(server_uuid TEXT)
RETURNS TABLE (rating INTEGER, count BIGINT, percentage NUMERIC)
AS $$
DECLARE total BIGINT;
BEGIN
  SELECT COUNT(*) INTO total FROM server_reviews WHERE server_id = server_uuid;
  RETURN QUERY
  SELECT r.rating, COUNT(*)::BIGINT, ROUND(COUNT(*) * 100.0 / NULLIF(total, 0), 1)
  FROM server_reviews r WHERE r.server_id = server_uuid GROUP BY r.rating ORDER BY r.rating DESC;
END;
$$ LANGUAGE plpgsql;

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$BEGIN NEW.updated_at = now(); RETURN NEW; END;$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_reviews_updated_at ON server_reviews;
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON server_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();