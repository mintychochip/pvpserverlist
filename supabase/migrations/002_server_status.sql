-- Server Status Tracking Migration
-- Adds real-time ping data columns to servers table

-- Add status tracking columns to servers
ALTER TABLE servers 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'unknown')),
ADD COLUMN IF NOT EXISTS players_online INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ping_ms INTEGER,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_last_ping ON servers(last_ping_at);

-- View for online servers sorted by player count
CREATE OR REPLACE VIEW online_servers AS
SELECT *
FROM servers
WHERE status = 'online'
ORDER BY players_online DESC;

-- Function to get server uptime stats
CREATE OR REPLACE FUNCTION get_server_uptime(server_uuid TEXT, days INTEGER DEFAULT 7)
RETURNS TABLE (
  total_pings BIGINT,
  online_pings BIGINT,
  uptime_percent NUMERIC,
  avg_players NUMERIC,
  max_players_seen INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_pings,
    COUNT(*) FILTER (WHERE status = 'online')::BIGINT as online_pings,
    ROUND((COUNT(*) FILTER (WHERE status = 'online') * 100.0 / NULLIF(COUNT(*), 0)), 2) as uptime_percent,
    ROUND(AVG(players_online), 2) as avg_players,
    MAX(players_online) as max_players_seen
  FROM server_ping_history
  WHERE server_id = server_uuid
  AND created_at >= now() - (days || ' days')::interval;
END;
$$ LANGUAGE plpgsql;

-- Also create a simple version for servers table (if no history yet)
CREATE OR REPLACE FUNCTION get_server_uptime_simple(server_uuid TEXT)
RETURNS TABLE (
  current_status TEXT,
  last_ping TIMESTAMP WITH TIME ZONE,
  players_online INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.status,
    s.last_ping_at,
    s.players_online
  FROM servers s
  WHERE s.id = server_uuid;
END;
$$ LANGUAGE plpgsql;

-- Table for detailed ping history (for analytics charts)
CREATE TABLE IF NOT EXISTS server_ping_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL REFERENCES servers(id),
  status TEXT,
  players_online INTEGER,
  max_players INTEGER,
  ping_ms INTEGER,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ping_history_server ON server_ping_history(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ping_history_time ON server_ping_history(created_at DESC);

-- Function to get player count history for charts
CREATE OR REPLACE FUNCTION get_player_history(
  server_uuid TEXT, 
  hours_back INTEGER DEFAULT 24,
  interval_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  time_bucket TIMESTAMP WITH TIME ZONE,
  avg_players NUMERIC,
  max_players INTEGER,
  min_players INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    date_trunc('hour', created_at) + 
      (interval_minutes * (EXTRACT(MINUTE FROM created_at)::int / interval_minutes))::int * interval '1 minute' as time_bucket,
    ROUND(AVG(players_online), 0) as avg_players,
    MAX(players_online) as max_players,
    MIN(players_online) as min_players
  FROM server_ping_history
  WHERE server_id = server_uuid
    AND created_at >= now() - (hours_back || ' hours')::interval
    AND status = 'online'
  GROUP BY time_bucket
  ORDER BY time_bucket ASC;
END;
$$ LANGUAGE plpgsql;
