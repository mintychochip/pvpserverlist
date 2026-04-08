-- Migration: Add server_reports table for moderation
-- Users can report fake/offline/inappropriate servers

CREATE TABLE IF NOT EXISTS server_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  reason VARCHAR(50) NOT NULL CHECK (reason IN (
    'fake_server', 'offline', 'incorrect_info', 'spam', 
    'inappropriate_content', 'other'
  )),
  details TEXT,
  reporter_email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_server_id ON server_reports(server_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON server_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON server_reports(created_at DESC);

-- Enable RLS
ALTER TABLE server_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to create reports
CREATE POLICY "Allow anyone to create reports"
  ON server_reports
  FOR INSERT
  TO anon
  WITH CHECK (true);

COMMENT ON TABLE server_reports IS 'User-submitted reports for server moderation';
