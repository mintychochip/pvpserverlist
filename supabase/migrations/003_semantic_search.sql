-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to servers table
ALTER TABLE servers ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS servers_embedding_idx ON servers USING ivfflat (embedding vector_cosine_ops);

-- Function to match servers by semantic similarity
CREATE OR REPLACE FUNCTION match_servers(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE(
  id text,
  name text,
  ip text,
  port int,
  description text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.ip,
    s.port,
    s.description,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM servers s
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Table for click analytics (if not using KV)
CREATE TABLE IF NOT EXISTS server_clicks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id text REFERENCES servers(id) ON DELETE CASCADE,
  click_type text DEFAULT 'view',
  source text DEFAULT 'listing',
  ip_hash text,
  country text,
  user_agent_hash text,
  created_at timestamp with time zone DEFAULT now()
);

-- Index for aggregating clicks
CREATE INDEX IF NOT EXISTS idx_clicks_server_date ON server_clicks(server_id, created_at);
CREATE INDEX IF NOT EXISTS idx_clicks_date ON server_clicks(created_at);

-- View for popular servers (last 24 hours)
CREATE OR REPLACE VIEW popular_servers_24h AS
SELECT 
  server_id,
  COUNT(*) as click_count,
  MAX(created_at) as last_click
FROM server_clicks
WHERE created_at > now() - interval '24 hours'
GROUP BY server_id
ORDER BY click_count DESC;

-- Function to get trending servers
CREATE OR REPLACE FUNCTION get_trending_servers(limit_count int DEFAULT 10)
RETURNS TABLE(
  server_id text,
  name text,
  click_count bigint,
  rank bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as server_id,
    s.name,
    COUNT(c.id) as click_count,
    row_number() OVER (ORDER BY COUNT(c.id) DESC) as rank
  FROM servers s
  LEFT JOIN server_clicks c ON s.id = c.server_id
    AND c.created_at > now() - interval '24 hours'
  GROUP BY s.id, s.name
  ORDER BY click_count DESC
  LIMIT limit_count;
END;
$$;

-- Enable RLS on clicks table
ALTER TABLE server_clicks ENABLE ROW LEVEL SECURITY;

-- Allow inserts from authenticated users (or use service role)
CREATE POLICY "Allow click tracking inserts" ON server_clicks
  FOR INSERT WITH CHECK (true);

-- Only allow reading aggregated data, not individual clicks
CREATE POLICY "Allow reading own clicks only" ON server_clicks
  FOR SELECT USING (false);
