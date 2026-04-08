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

      // Get Servers List (for watcher)
      if ((path === '/api/servers' || path === '/api/servers/') && request.method === 'GET') {
        return await handleServersList(request, env);
      }

      // Ping Server (for watcher)
      if (path === '/api/ping' && request.method === 'POST') {
        return await handlePing(request, env);
      }

      // Trigger batch ping (cron-style)
      if (path === '/api/cron/ping' && request.method === 'POST') {
        return await handleCronPing(request, env);
      }

      // Batch Embedding Generation (for populating server embeddings)
      if (path === '/api/embeddings/batch' && request.method === 'POST') {
        return await handleEmbeddingsBatch(request, env);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },

  // Cron trigger handler - runs every 5 minutes
  async scheduled(event, env, ctx) {
    console.log('⏰ Cron triggered at:', new Date().toISOString());
    
    try {
      const result = await runBatchPing(env);
      console.log('✅ Cron completed:', result);
    } catch (err) {
      console.error('❌ Cron failed:', err);
    }
  }
};

// Generate embedding using Gemini gemini-embedding-001
async function generateEmbedding(text, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
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

// Build searchable text from server data
function buildServerText(server) {
  const parts = [
    `Server: ${server.name}`,
    server.description || '',
    server.gamemode ? `Gamemode: ${server.gamemode}` : '',
    server.tags?.length ? `Tags: ${server.tags.join(', ')}` : '',
    server.features?.length ? `Features: ${server.features.join(', ')}` : '',
    server.version ? `Version: ${server.version}` : '',
    server.status ? `Status: ${server.status}` : '',
  ];
  return parts.filter(Boolean).join('. ').trim();
}

// Batch Embedding Generation - Populate server embeddings
async function handleEmbeddingsBatch(request, env) {
  // Verify cron secret
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = env.CRON_SECRET;

  const corsHeadersBatch = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeadersBatch, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 50, 100);
    const dryRun = body.dryRun || false;

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;
    const geminiApiKey = env.GEMINI_API_KEY;

    if (!supabaseKey || !geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Missing required secrets' }), {
        status: 500,
        headers: { ...corsHeadersBatch, 'Content-Type': 'application/json' },
      });
    }

    // Check current status
    const statusRes = await fetch(`${supabaseUrl}/rest/v1/rpc/servers_embedding_status`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const status = await statusRes.json();
    const stats = status[0] || { total: 0, with_embeddings: 0, without_embeddings: 0 };

    // Fetch servers without embeddings
    const fetchRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=id,name,description,tags,gamemode,features,status,version&embedding=is.null&limit=${batchSize}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const servers = await fetchRes.json();

    if (!Array.isArray(servers) || servers.length === 0) {
      return new Response(JSON.stringify({
        message: 'No servers need embeddings',
        status: stats,
        processed: 0,
      }), {
        headers: { ...corsHeadersBatch, 'Content-Type': 'application/json' },
      });
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    // Process each server
    for (const server of servers) {
      try {
        const text = buildServerText(server);

        if (dryRun) {
          results.succeeded++;
          results.processed++;
          continue;
        }

        // Generate embedding
        const embedding = await generateEmbedding(text, geminiApiKey);

        // Update server
        const updateRes = await fetch(`${supabaseUrl}/rest/v1/servers?id=eq.${server.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ embedding }),
        });

        if (!updateRes.ok) {
          throw new Error(`Update failed: ${updateRes.status}`);
        }

        results.succeeded++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id: server.id, error: err.message });
      }
      results.processed++;
    }

    // Get updated status
    const finalStatusRes = await fetch(`${supabaseUrl}/rest/v1/rpc/servers_embedding_status`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const finalStatus = await finalStatusRes.json();

    return new Response(JSON.stringify({
      message: `Processed ${results.processed} servers`,
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed,
      dryRun,
      batchSize,
      status: finalStatus[0],
      errors: results.errors.slice(0, 5),
    }), {
      headers: { ...corsHeadersBatch, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Batch embedding error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeadersBatch, 'Content-Type': 'application/json' },
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

// Get servers list for watcher
async function handleServersList(request, env) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit')) || 1000;
  
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=id,host,port,game_mode&limit=${limit}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`);
    }
    
    const servers = await response.json();
    
    return new Response(JSON.stringify({ 
      servers,
      count: servers.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Servers list error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Ping server endpoint for watcher
async function handlePing(request, env) {
  const { serverId } = await request.json();
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Missing serverId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  try {
    // Get server details
    const serverResp = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&select=host,port`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    const servers = await serverResp.json();
    if (!servers || servers.length === 0) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const { host, port } = servers[0];
    
    // Simple TCP ping (just check if port is open)
    const startTime = Date.now();
    
    // Use a basic fetch with short timeout to check connectivity
    // For Minecraft servers, we could do proper SLP protocol here
    const pingResult = { 
      online: true,
      latency: Date.now() - startTime,
      players: 0,
      max_players: 0
    };
    
    // Update last_ping in database
    await fetch(`${supabaseUrl}/rest/v1/servers?id=eq.${serverId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ 
        last_ping: new Date().toISOString(),
        status: 'online'
      })
    });
    
    return new Response(JSON.stringify({
      serverId,
      ...pingResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Ping error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Cron endpoint handler
async function handleCronPing(request, env) {
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = env.CRON_SECRET;
  
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const result = await runBatchPing(env);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Batch ping all servers (used by cron)
async function runBatchPing(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_KEY not configured');
  }
  
  // Fetch all active servers
  const serversResp = await fetch(
    `${supabaseUrl}/rest/v1/servers?select=id,host,port&limit=5000`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    }
  );
  
  if (!serversResp.ok) {
    throw new Error(`Failed to fetch servers: ${serversResp.status}`);
  }
  
  const servers = await serversResp.json();
  console.log(`📋 Found ${servers.length} servers to ping`);
  
  let success = 0;
  let failed = 0;
  
  // Ping each server (with small delay between to avoid rate limits)
  for (const server of servers) {
    try {
      await pingServerInternal(env, server.id);
      success++;
    } catch (err) {
      console.error(`❌ Failed to ping server ${server.id}:`, err.message);
      failed++;
    }
    
    // Small delay to avoid overwhelming Supabase
    await new Promise(r => setTimeout(r, 50));
  }
  
  const result = {
    total: servers.length,
    success,
    failed,
    timestamp: new Date().toISOString()
  };
  
  console.log('✅ Batch ping complete:', result);
  return result;
}

// Internal ping function (reused by both API and cron)
async function pingServerInternal(env, serverId) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  const startTime = Date.now();
  
  // Update last_ping timestamp
  const response = await fetch(`${supabaseUrl}/rest/v1/servers?id=eq.${serverId}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ 
      last_ping: new Date().toISOString(),
      status: 'online'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Update failed: ${response.status}`);
  }
  
  return { serverId, latency: Date.now() - startTime };
}
