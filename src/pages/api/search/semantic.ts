/**
 * Semantic Search API Endpoint for Astro SSR
 * POST /api/search/semantic - AI-powered semantic search using Gemini embeddings
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Generate embedding using Gemini embedding model
async function generateEmbedding(text: string, apiKey: string) {
  // Use models/embedding-001 which is the standard text embedding model
  // Reference: https://ai.google.dev/gemini-api/docs/embeddings
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini embedding API error: ${errorText}`);
  }

  const data = await response.json();
  const embedding = data.embedding?.values || data.embedding;
  // embedding-001 produces 768 dimensions
  return embedding;
}

export const POST: APIRoute = async ({ request, locals }) => {
  // Get environment from Cloudflare runtime
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  try {
    const { query, limit = 10 } = await request.json();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ error: 'Query too short' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.GEMINI_API_KEY;
    const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    // Try semantic search first, fall back to text search if embedding fails
    let results = [];
    let semantic = false;

    if (apiKey) {
      try {
        // Try Gemini embedding
        const embedding = await generateEmbedding(query, apiKey);
        
        // Search Supabase for similar embeddings
        if (supabaseKey) {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/match_servers`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query_embedding: embedding,
              match_threshold: 0.3,
              match_count: limit
            })
          });

          const embeddingResults = await response.json();
          if (Array.isArray(embeddingResults) && embeddingResults.length > 0) {
            results = embeddingResults;
            semantic = true;
          }
        }
      } catch (embedError) {
        console.log('Embedding failed, falling back to text search:', embedError);
      }
    }

    // Fallback to text search if semantic search failed or no results
    if (!semantic && supabaseKey) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,description,tags,icon,status,players_online,max_players,vote_count&or=(name.ilike.%25${encodeURIComponent(query)}%25,description.ilike.%25${encodeURIComponent(query)}%25)&order=vote_count.desc&limit=${limit}`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          }
        }
      );
      results = await response.json();
    }

    return new Response(JSON.stringify({
      query,
      results,
      count: Array.isArray(results) ? results.length : 0,
      semantic,
      fallback: !semantic
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Search error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
