-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Servers table
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT UNIQUE NOT NULL,
  port INTEGER NOT NULL DEFAULT 25565,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  tags TEXT[] DEFAULT '{}',
  verified BOOLEAN DEFAULT false,
  votifier_key TEXT,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Server status cache
CREATE TABLE server_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  status BOOLEAN DEFAULT false,
  latency_ms INTEGER,
  player_count INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 0,
  motd TEXT,
  last_checked TIMESTAMPTZ DEFAULT now(),
  UNIQUE(server_id)
);

-- Votes with 24h cooldown tracked at query time
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  visitor_ip TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Verification tokens for no-plugin MOTD verification
CREATE TABLE verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  motd_pattern TEXT NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes'),
  verified_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_servers_ip ON servers(ip);
CREATE INDEX idx_servers_tags ON servers USING GIN(tags);
CREATE INDEX idx_server_status_server_id ON server_status(server_id);
CREATE INDEX idx_votes_server_id ON votes(server_id);
CREATE INDEX idx_votes_visitor_ip ON votes(visitor_ip);
CREATE INDEX idx_votes_created_at ON votes(created_at);
CREATE INDEX idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX idx_verification_tokens_expires_at ON verification_tokens(expires_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER servers_updated_at
  BEFORE UPDATE ON servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;

-- Public read access for servers and status
CREATE POLICY "Public read servers" ON servers FOR SELECT USING (true);
CREATE POLICY "Public read server_status" ON server_status FOR SELECT USING (true);

-- Service role can do everything (for Edge Functions)
-- Votes: anyone can insert, but cooldown enforced in application logic
CREATE POLICY "Public insert votes" ON votes FOR INSERT WITH CHECK (true);
