-- Fix Semantic Search - Use Gemini text-embedding-004 (768 dimensions)
-- Gemini text-embedding-004 produces 768 dimensions (better quality, fits ivfflat limit)

-- Keep the existing 768-dimension setup
-- No need to change - the original migration was correct for text-embedding-004

-- Drop and recreate the function with correct signature
DROP FUNCTION IF EXISTS match_servers(vector, float, int);

-- Just ensure the function signature is correct
CREATE OR REPLACE FUNCTION match_servers(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id text,
  name text,
  ip text,
  port int,
  description text,
  tags text[],
  icon text,
  status text,
  players_online int,
  max_players int,
  vote_count int,
  country_code text,
  version text,
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
    s.tags,
    s.icon,
    s.status,
    s.players_online,
    s.max_players,
    s.vote_count,
    s.country_code,
    s.version,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM servers s
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to update a single server's embedding
CREATE OR REPLACE FUNCTION update_server_embedding(
  server_id text,
  new_embedding vector(768)
)
RETURNS void AS $$
BEGIN
  UPDATE servers SET embedding = new_embedding WHERE id = server_id;
END;
$$ LANGUAGE plpgsql;

-- View to check which servers have embeddings
CREATE OR REPLACE VIEW servers_embedding_status AS
SELECT 
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
  COUNT(*) FILTER (WHERE embedding IS NULL) as without_embeddings,
  COUNT(*) as total
FROM servers;

-- Fix the match_servers function to use correct dimension
CREATE OR REPLACE FUNCTION match_servers(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id text,
  name text,
  ip text,
  port int,
  description text,
  tags text[],
  icon text,
  status text,
  players_online int,
  max_players int,
  vote_count int,
  country_code text,
  version text,
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
    s.tags,
    s.icon,
    s.status,
    s.players_online,
    s.max_players,
    s.vote_count,
    s.country_code,
    s.version,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM servers s
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to update a single server's embedding
CREATE OR REPLACE FUNCTION update_server_embedding(
  server_id text,
  new_embedding vector(3072)
)
RETURNS void AS $$
BEGIN
  UPDATE servers SET embedding = new_embedding WHERE id = server_id;
END;
$$ LANGUAGE plpgsql;

-- View to check which servers have embeddings
CREATE OR REPLACE VIEW servers_embedding_status AS
SELECT 
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
  COUNT(*) FILTER (WHERE embedding IS NULL) as without_embeddings,
  COUNT(*) as total
FROM servers;
