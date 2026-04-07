-- Reviews & Ratings System
CREATE TABLE IF NOT EXISTS server_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id uuid REFERENCES servers(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  created_at timestamp with time zone DEFAULT now(),
  helpful_count integer DEFAULT 0,
  is_approved boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_reviews_server ON server_reviews(server_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON server_reviews(created_at DESC);

-- Uptime tracking
CREATE TABLE IF NOT EXISTS server_uptime (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id uuid REFERENCES servers(id) ON DELETE CASCADE,
  checked_at timestamp with time zone DEFAULT now(),
  is_online boolean,
  players_online integer,
  response_time_ms integer
);

CREATE INDEX IF NOT EXISTS idx_uptime_server ON server_uptime(server_id, checked_at DESC);

-- View for current uptime stats
CREATE OR REPLACE VIEW server_uptime_stats AS
SELECT 
  server_id,
  COUNT(*) FILTER (WHERE is_online) as online_checks,
  COUNT(*) as total_checks,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_online) / COUNT(*), 1) as uptime_percentage,
  MAX(checked_at) as last_check
FROM server_uptime
WHERE checked_at > now() - interval '24 hours'
GROUP BY server_id;

-- Update servers with rating average
ALTER TABLE servers ADD COLUMN IF NOT EXISTS rating_average decimal(2,1);
ALTER TABLE servers ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0;

-- Function to update server rating
CREATE OR REPLACE FUNCTION update_server_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE servers
  SET 
    rating_average = (SELECT AVG(rating)::decimal(2,1) FROM server_reviews WHERE server_id = NEW.server_id AND is_approved = true),
    rating_count = (SELECT COUNT(*) FROM server_reviews WHERE server_id = NEW.server_id AND is_approved = true)
  WHERE id = NEW.server_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_server_rating_trigger
AFTER INSERT OR UPDATE OR DELETE ON server_reviews
FOR EACH ROW
EXECUTE FUNCTION update_server_rating();

-- RLS for reviews
ALTER TABLE server_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow reading approved reviews" ON server_reviews
  FOR SELECT USING (is_approved = true);

CREATE POLICY "Allow inserting reviews" ON server_reviews
  FOR INSERT WITH CHECK (true);
