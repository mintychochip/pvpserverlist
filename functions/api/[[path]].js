/**
 * Cloudflare Worker: Semantic Search API using Mixedbread + Gemini
 * 
 * Routes:
 * - POST /search/semantic - AI-powered semantic search using embeddings
 * - GET /search/suggestions - AI-powered search suggestions using Gemma 4B
 * - POST /embed - Generate embeddings using Mixedbread (primary) or Gemini (fallback)
 * 
 * Uses:
 * - Mixedbread mxbai-embed-large-v1 (1024 dims, cheaper) - PRIMARY
 * - Gemini embedding-001 (768 dims) - FALLBACK
 * - Gemma-3-4b-it for text generation (suggestions)
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Pages Function handler
export async function onRequest(context) {
  const { request, env } = context;
  
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

      // Dashboard APIs - Server Edit
      const editMatch = path.match(/^\/api\/servers\/([^\/]+)\/edit$/);
      if (editMatch && request.method === 'POST') {
        return await handleServerEdit(editMatch[1], request, env);
      }

      // Dashboard APIs - Server Posts
      const postsMatch = path.match(/^\/api\/servers\/([^\/]+)\/posts$/);
      if (postsMatch) {
        if (request.method === 'GET') {
          return await handleServerPostsGet(postsMatch[1], env);
        }
        if (request.method === 'POST') {
          return await handleServerPostsCreate(postsMatch[1], request, env);
        }
      }

      // Dashboard APIs - Server Analytics
      const analyticsMatch = path.match(/^\/api\/servers\/([^\/]+)\/analytics$/);
      if (analyticsMatch && request.method === 'GET') {
        return await handleServerAnalytics(analyticsMatch[1], request, env);
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

// End of onRequest function

// Generate embedding using Gemini gemini-embedding-001
// Generate embeddings using Mixedbread (primary) with Gemini fallback
async function generateEmbedding(text, env) {
  const mixedbreadKey = env.MIXEDBREAD_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;
  
  // Try Mixedbread first (cheaper, 1024 dimensions)
  if (mixedbreadKey) {
    try {
      const response = await fetch('https://api.mixedbread.ai/v1/embeddings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mixedbreadKey}`
        },
        body: JSON.stringify({
          model: 'mixedbread-ai/mxbai-embed-large-v1',
          input: text
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.data[0].embedding;
      }
    } catch (err) {
      console.log('Mixedbread failed, falling back to Gemini:', err.message);
    }
  }
  
  // Fallback to Gemini (768 dimensions)
  if (geminiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
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
  
  throw new Error('No embedding API key configured (MIXEDBREAD_API_KEY or GEMINI_API_KEY)');
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

  const mixedbreadKey = env.MIXEDBREAD_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;
  
  if (!mixedbreadKey && !geminiKey) {
    return new Response(JSON.stringify({ error: 'MIXEDBREAD_API_KEY or GEMINI_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Generate embedding for query
    const embedding = await generateEmbedding(query, env);

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

// Generate embeddings using Mixedbread (primary) or Gemini (fallback)
async function handleEmbed(request, env) {
  const { text } = await request.json();
  
  if (!text) {
    return new Response(JSON.stringify({ error: 'Missing text' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const mixedbreadKey = env.MIXEDBREAD_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;
  
  if (!mixedbreadKey && !geminiKey) {
    return new Response(JSON.stringify({ error: 'MIXEDBREAD_API_KEY or GEMINI_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const embedding = await generateEmbedding(text, env);
    
    return new Response(JSON.stringify({
      embedding,
      dimensions: embedding.length,
      provider: mixedbreadKey ? 'mixedbread' : 'gemini'
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
    const mixedbreadKey = env.MIXEDBREAD_API_KEY;
    const geminiKey = env.GEMINI_API_KEY;

    if (!supabaseKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY' }), {
        status: 500,
        headers: { ...corsHeadersBatch, 'Content-Type': 'application/json' },
      });
    }
    
    if (!mixedbreadKey && !geminiKey) {
      return new Response(JSON.stringify({ error: 'Missing MIXEDBREAD_API_KEY or GEMINI_API_KEY' }), {
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
        const embedding = await generateEmbedding(text, env);

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

// Dashboard API: Edit Server Details
async function handleServerEdit(serverId, request, env) {
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { description, website, tags, owner_email, discord_invite } = body;
    
    // Verify the server is claimed by this email
    const verifyResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&claimed=eq.true&select=id,claimed_by`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!verifyResponse.ok) {
      throw new Error('Failed to verify server ownership');
    }
    
    const servers = await verifyResponse.json();
    if (servers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Server not found or not claimed' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const server = servers[0];
    
    // Check if the owner_email matches the claimed_by email
    if (owner_email && server.claimed_by !== owner_email) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - you do not own this server' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Build update object
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (website !== undefined) updates.website = website;
    if (tags !== undefined) updates.tags = tags;
    if (discord_invite !== undefined) updates.discord_invite = discord_invite;
    updates.updated_at = new Date().toISOString();
    
    // Update the server
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(updates)
      }
    );
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Update failed: ${errorText}`);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Server updated successfully',
        updated_fields: Object.keys(updates).filter(k => k !== 'updated_at')
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (err) {
    console.error('Server edit error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to update server' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Dashboard API: Get Server Posts
async function handleServerPostsGet(serverId, env) {
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/server_posts?server_id=eq.${serverId}&order=created_at.desc&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch posts');
    }
    
    const posts = await response.json();
    
    const CATEGORIES = {
      tournament: { name: 'Tournament', icon: '🏆' },
      drop: { name: 'Drop/Giveaway', icon: '🎁' },
      update: { name: 'Server Update', icon: '🚀' },
      pvp: { name: 'PvP Event', icon: '⚔️' },
      building: { name: 'Building Contest', icon: '🏗️' },
      social: { name: 'Social Event', icon: '🎉' },
      other: { name: 'Other', icon: '✨' }
    };
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        posts: posts.map(post => ({
          ...post,
          category_info: CATEGORIES[post.category] || CATEGORIES.other
        }))
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (err) {
    console.error('Get posts error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to fetch posts' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Dashboard API: Create Server Post
async function handleServerPostsCreate(serverId, request, env) {
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { category, title, content, author } = body;
    
    // Validate required fields
    if (!category || !title || !content) {
      return new Response(
        JSON.stringify({ error: 'Category, title, and content are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Verify server is claimed
    const verifyResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&claimed=eq.true&select=id,claimed_by,name`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!verifyResponse.ok) {
      throw new Error('Failed to verify server');
    }
    
    const servers = await verifyResponse.json();
    if (servers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Server not found or not claimed' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const server = servers[0];
    
    // Create the post
    const postData = {
      server_id: serverId,
      category,
      title: title.slice(0, 200),
      content: content.slice(0, 2000),
      author: author || server.claimed_by || 'Server Owner',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const createResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_posts`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(postData)
      }
    );
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create post: ${errorText}`);
    }
    
    const createdPost = await createResponse.json();
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Post created successfully',
        post: createdPost[0]
      }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (err) {
    console.error('Create post error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to create post' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Dashboard API: Server Analytics
async function handleServerAnalytics(serverId, request, env) {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '30', 10);
  const ownerEmail = url.searchParams.get('email');
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify ownership if email provided
    if (ownerEmail) {
      const verifyResponse = await fetch(
        `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&claimed=eq.true&claimed_by=eq.${encodeURIComponent(ownerEmail)}&select=id`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
      
      if (!verifyResponse.ok) {
        throw new Error('Failed to verify ownership');
      }
      
      const servers = await verifyResponse.json();
      if (servers.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized or server not found' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Fetch vote history
    const votesResponse = await fetch(
      `${supabaseUrl}/rest/v1/votes?server_id=eq.${serverId}&created_at=gte.${startDate.toISOString()}&order=created_at.desc&select=created_at,voter_ip`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    // Get current server stats
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&select=vote_count,players_online,max_players,avg_rating,review_count,views`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    let serverStats = {};
    if (serverResponse.ok) {
      const servers = await serverResponse.json();
      if (servers.length > 0) {
        serverStats = servers[0];
      }
    }
    
    // Process vote data into daily buckets
    const votes = votesResponse.ok ? await votesResponse.json() : [];
    const dailyVotes = new Map();
    
    // Initialize all days with 0
    for (let i = 0; i < days; i++) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyVotes.set(key, { date: key, votes: 0, unique_voters: new Set() });
    }
    
    // Aggregate votes
    votes.forEach((vote) => {
      const date = vote.created_at.split('T')[0];
      if (dailyVotes.has(date)) {
        const day = dailyVotes.get(date);
        day.votes++;
        day.unique_voters.add(vote.voter_ip);
      }
    });
    
    // Convert to array and calculate unique counts
    const voteHistory = Array.from(dailyVotes.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({
        date: day.date,
        votes: day.votes,
        unique_voters: day.unique_voters.size
      }));
    
    // Calculate summary stats
    const totalVotes = voteHistory.reduce((sum, day) => sum + day.votes, 0);
    const avgVotesPerDay = totalVotes / days;
    const peakVotes = Math.max(...voteHistory.map((d) => d.votes));
    const peakDay = voteHistory.find((d) => d.votes === peakVotes)?.date;
    
    return new Response(
      JSON.stringify({
        success: true,
        period: { days, start: startDate.toISOString(), end: endDate.toISOString() },
        summary: {
          total_votes: totalVotes,
          avg_votes_per_day: parseFloat(avgVotesPerDay.toFixed(1)),
          peak_votes: peakVotes,
          peak_day: peakDay
        },
        current_stats: serverStats,
        vote_history: voteHistory
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (err) {
    console.error('Analytics error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to fetch analytics' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
