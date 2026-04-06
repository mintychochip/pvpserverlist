-- Server Status Tracking Migration

-- Add status tracking columns
ALTER TABLE servers 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'unknown')),
ADD COLUMN IF NOT EXISTS players_online INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ping_ms INTEGER,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMP WITH TIME ZONE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_last_ping ON servers(last_ping_at);

-- Create ping history table
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

-- Functions for analytics
CREATE OR REPLACE FUNCTION get_player_history(server_uuid TEXT, hours_back INTEGER DEFAULT 24, interval_minutes INTEGER DEFAULT 30)
RETURNS TABLE (time_bucket TIMESTAMP WITH TIME ZONE, avg_players NUMERIC, max_players INTEGER, min_players INTEGER)
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    date_trunc('hour', created_at) + (interval_minutes * (EXTRACT(MINUTE FROM created_at)::int / interval_minutes))::int * interval '1 minute',
    ROUND(AVG(players_online), 0),
    MAX(players_online),
    MIN(players_online)
  FROM server_ping_history
  WHERE server_id = server_uuid AND created_at >= now() - (hours_back || ' hours')::interval AND status = 'online'
  GROUP BY 1 ORDER BY 1 ASC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_server_uptime(server_uuid TEXT, days INTEGER DEFAULT 7)
RETURNS TABLE (total_pings BIGINT, online_pings BIGINT, uptime_percent NUMERIC, avg_players NUMERIC, max_players_seen INTEGER)
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'online')::BIGINT,
    ROUND((COUNT(*) FILTER (WHERE status = 'online') * 100.0 / NULLIF(COUNT(*), 0)), 2),
    ROUND(AVG(players_online), 2),
    MAX(players_online)
  FROM server_ping_history
  WHERE server_id = server_uuid AND created_at >= now() - (days || ' days')::interval;
END;
$$ LANGUAGE plpgsql;