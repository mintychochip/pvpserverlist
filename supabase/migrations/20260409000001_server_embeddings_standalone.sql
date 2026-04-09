-- Create table to track Pinecone embeddings
CREATE TABLE IF NOT EXISTS server_embeddings (
  server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  pinecone_id TEXT NOT NULL,
  indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_server_embeddings_indexed_at ON server_embeddings(indexed_at);
CREATE INDEX IF NOT EXISTS idx_server_embeddings_pinecone_id ON server_embeddings(pinecone_id);

-- Enable RLS
ALTER TABLE server_embeddings ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to server_embeddings"
  ON server_embeddings FOR SELECT
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to server_embeddings"
  ON server_embeddings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
