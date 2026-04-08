/**
 * Cloudflare Worker: Semantic Search API using Gemini
 * 
 * Routes:
 * - POST /search/semantic - AI-powered semantic search using Gemini embeddings
 * - GET /search/suggestions - AI-powered search suggestions using Gemma 4B
 * - POST /embed - Generate embeddings using Gemini
 * 
 * Uses Gemini API:
 * - gemini-embedding-001 for embeddings (3072 dimensions)
 * - gemma-3-4b-it for text generation
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Semantic Search
      if (path === '/api/search/semantic' && request.method === 'POST') {
        return await handleSemanticSearch(request, env);
      }

      // Search Suggestions
      if (path === '/api/search/suggestions' && request.method === 'GET') {
        return await handleSuggestions(request, env);
      }
      
      // Generate Embedding
      if (path === '/api/embed' && request.method === 'POST') {
        return await handleEmbed(request, env);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Generate embedding using Gemini text-embedding-004 (768 dimensions)
async function generateEmbedding(text, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini embedding API error: ${error}`);
  }

  const data = await response.json();
  return data.embedding?.values || data.embedding;
}

// Semantic Search using Gemini embeddings
async function handleSemanticSearch(request, env) {
  const { query, limit = 10 } = await request.json();

  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ error: 'Query too short' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Generate embedding for query using Gemini
    const embedding = await generateEmbedding(query, apiKey);

    // Search Supabase for similar embeddings using pgvector
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/match_servers`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit
      })
    });

    const results = await response.json();

    return new Response(JSON.stringify({
      query,
      results,
      count: results.length,
      semantic: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Semantic search error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// AI-powered search suggestions using Gemma 4B
async function handleSuggestions(request, env) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';

  if (query.length < 2) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ suggestions: generateFallbackSuggestions(query) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const prompt = `You are a Minecraft server search assistant. Given a partial search query, suggest 5 relevant completions. Return ONLY a JSON array of strings, no other text.

Query: "${query}"

Suggestions (JSON array only):`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemma API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse suggestions from response
    let suggestions = [];
    try {
      // Try to extract JSON array
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        suggestions = JSON.parse(match[0]);
      }
    } catch (e) {
      // Fallback to basic suggestions
      suggestions = generateFallbackSuggestions(query);
    }

    return new Response(JSON.stringify({ 
      query,
      suggestions: suggestions.slice(0, 5)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Suggestions error:', err);
    return new Response(JSON.stringify({ 
      query,
      suggestions: generateFallbackSuggestions(query)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Generate embeddings using Gemini
async function handleEmbed(request, env) {
  const { text } = await request.json();
  
  if (!text) {
    return new Response(JSON.stringify({ error: 'Missing text' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const embedding = await generateEmbedding(text, apiKey);
    
    return new Response(JSON.stringify({
      embedding,
      dimensions: embedding.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Fallback suggestions when API unavailable
function generateFallbackSuggestions(query) {
  const q = query.toLowerCase();
  return [
    `${q} pvp server`,
    `${q} survival smp`,
    `${q} skyblock`,
    `${q} factions`,
    `${q} minigames`
  ];
}
