-- Votifier Integration Migration with Anti-Abuse
-- Run this in Supabase SQL Editor

-- Create votes table with full tracking
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  username TEXT NOT NULL,
  ip_address TEXT,
  fingerprint TEXT, -- Browser fingerprint for device tracking
  country TEXT,
  isp TEXT,
  is_proxy BOOLEAN DEFAULT false,
  is_vpn BOOLEAN DEFAULT false,
  is_tor BOOLEAN DEFAULT false,
  fraud_score INTEGER DEFAULT 0,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient lookups and abuse prevention
CREATE INDEX IF NOT EXISTS idx_votes_user_cooldown 
ON votes(server_id, username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_votes_ip_cooldown 
ON votes(server_id, ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_votes_fingerprint 
ON votes(server_id, fingerprint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_votes_ip_abuse_check 
ON votes(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_votes_server_stats 
ON votes(server_id, created_at DESC);

-- Add Votifier columns to servers table
ALTER TABLE servers 
ADD COLUMN IF NOT EXISTS votifier_key TEXT,
ADD COLUMN IF NOT EXISTS discord_webhook TEXT,
ADD COLUMN IF NOT EXISTS votifier_port INTEGER DEFAULT 8192;

-- Create view for suspicious activity monitoring
CREATE OR REPLACE VIEW suspicious_votes AS
SELECT 
  ip_address,
  COUNT(DISTINCT username) as unique_usernames,
  COUNT(*) as total_votes,
  MAX(created_at) as last_vote,
  BOOL_OR(is_vpn OR is_proxy OR is_tor) as used_proxy
FROM votes
WHERE created_at >= now() - interval '7 days'
GROUP BY ip_address
HAVING COUNT(DISTINCT username) > 5 OR COUNT(*) > 10;

-- Create function to get server vote stats
CREATE OR REPLACE FUNCTION get_server_vote_stats(server_uuid TEXT)
RETURNS TABLE (
  total_votes BIGINT,
  unique_voters BIGINT,
  votes_today BIGINT,
  votes_this_week BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_votes,
    COUNT(DISTINCT username)::BIGINT as unique_voters,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '1 day')::BIGINT as votes_today,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::BIGINT as votes_this_week
  FROM votes
  WHERE server_id = server_uuid;
END;
$$ LANGUAGE plpgsql;

-- Optional: Enable RLS if you want to restrict access
-- ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Note: Keep votes readable for stats but restrict inserts to the function
