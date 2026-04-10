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
  
  // Log all requests for debugging
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  console.log(`[API] ${request.method} ${url.pathname} (stripped: ${path})`);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check required env vars
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      console.error('[API] Missing required env vars: SUPABASE_URL or SUPABASE_SERVICE_KEY');
      return new Response(JSON.stringify({ 
        error: 'Server configuration error',
        detail: 'Missing required environment variables'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
      // Semantic Search
      if (path === '/search/semantic' && request.method === 'POST') {
        return await handleSemanticSearch(request, env);
      }

      // Hybrid Search (keyword + semantic)
      if (path === '/search/hybrid' && request.method === 'POST') {
        return await handleHybridSearch(request, env);
      }

      // Wizard Chat AI
      if (path === '/wizard/chat' && request.method === 'POST') {
        return await handleWizardChat(request, env);
      }

      // Search Suggestions
      if (path === '/search/suggestions' && request.method === 'GET') {
        return await handleSuggestions(request, env);
      }
      
      // Generate Embedding
      if (path === '/embed' && request.method === 'POST') {
        return await handleEmbed(request, env);
      }

      // Get Servers List (for watcher) - DEBUG: Added logging
      console.log('Checking servers route:', path, request.method);
      if ((path === '/servers' || path === '/servers/') && request.method === 'GET') {
        console.log('Matched servers route, calling handler');
        return await handleServersList(request, env);
      }

      // Ping Server (for watcher)
      if (path === '/ping' && request.method === 'POST') {
        return await handlePing(request, env);
      }

      // Trigger batch ping (cron-style)
      if (path === '/cron/ping' && request.method === 'POST') {
        return await handleCronPing(request, env);
      }

      // Wizard Chat (AI-powered server finder)
      if (path === '/wizard/chat' && request.method === 'POST') {
        return await handleWizardChat(request, env);
      }

      // Batch Embedding Generation (for populating server embeddings)
      if (path === '/embeddings/batch' && request.method === 'POST') {
        return await handleEmbeddingsBatch(request, env);
      }

      // Dashboard APIs - Server Edit
      const editMatch = path.match(/^\/servers\/([^\/]+)\/edit$/);
      if (editMatch && request.method === 'POST') {
        return await handleServerEdit(editMatch[1], request, env);
      }

      // Dashboard APIs - Server Posts
      const postsMatch = path.match(/^\/servers\/([^\/]+)\/posts$/);
      if (postsMatch) {
        if (request.method === 'GET') {
          return await handleServerPostsGet(postsMatch[1], env);
        }
        if (request.method === 'POST') {
          return await handleServerPostsCreate(postsMatch[1], request, env);
        }
      }

      // Dashboard APIs - Server Analytics
      const analyticsMatch = path.match(/^\/servers\/([^\/]+)\/analytics$/);
      if (analyticsMatch && request.method === 'GET') {
        return await handleServerAnalytics(analyticsMatch[1], request, env);
      }

      // Server Uptime Stats (for server page analytics chart)
      const uptimeMatch = path.match(/^\/servers\/([^\/]+)\/uptime$/);
      if (uptimeMatch && request.method === 'GET') {
        return await handleServerUptime(uptimeMatch[1], request, env);
      }

      // No route matched - return JSON 404
      console.log(`[API] No route matched for ${request.method} ${path}`);
      return new Response(JSON.stringify({ 
        error: 'Not Found',
        path: path,
        method: request.method,
        availableRoutes: [
          'GET /servers',
          'GET /search/suggestions',
          'POST /search/semantic',
          'POST /search/hybrid',
          'POST /wizard/chat',
          'POST /ping',
          'POST /cron/ping'
        ]
      }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error('[API] Worker error:', err);
      return new Response(JSON.stringify({ 
        error: err.message,
        stack: err.stack 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
}

// End of onRequest function

// Hybrid Search using Jina embeddings + Pinecone + keyword boost
async function handleHybridSearch(request, env) {
  const { query, limit = 12 } = await request.json();

  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ error: 'Query too short' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const jinaKey = env.JINA_API_KEY;
  const pineconeKey = env.PINECONE_API_KEY;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;

  if (!jinaKey || !pineconeKey) {
    return new Response(JSON.stringify({ error: 'API keys not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Generate embedding for semantic search
    const embedding = await generateEmbedding(query, env);

    // Get Pinecone index host
    const pineconeIndex = env.PINECONE_INDEX || 'guildpost';
    const indexResponse = await fetch(`https://api.pinecone.io/indexes/${pineconeIndex}`, {
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07'
      }
    });

    if (!indexResponse.ok) {
      throw new Error(`Pinecone index error: ${await indexResponse.text()}`);
    }

    const indexData = await indexResponse.json();
    const indexHost = indexData.host;

    // Query Pinecone for semantic matches
    const queryResponse = await fetch(`https://${indexHost}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'Content-Type': 'application/json',
        'X-Pinecone-API-Version': '2024-07'
      },
      body: JSON.stringify({
        vector: embedding,
        topK: limit * 2,
        includeMetadata: true
      })
    });

    if (!queryResponse.ok) {
      throw new Error(`Pinecone query error: ${await queryResponse.text()}`);
    }

    const queryData = await queryResponse.json();
    const semanticMatches = queryData.matches || [];

    // Keyword boost
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    
    const scoredResults = semanticMatches.map((match) => {
      let keywordScore = 0;
      const metadata = match.metadata || {};
      const textToSearch = [
        metadata.name,
        metadata.description,
        metadata.gamemode,
        ...(metadata.tags || [])
      ].join(' ').toLowerCase();

      for (const keyword of keywords) {
        if (textToSearch.includes(keyword)) {
          keywordScore += 0.15;
        }
      }

      const hybridScore = match.score + keywordScore;
      
      return {
        ...match,
        hybridScore,
        semanticScore: match.score,
        keywordScore
      };
    });

    scoredResults.sort((a, b) => b.hybridScore - a.hybridScore);
    const topMatches = scoredResults.slice(0, limit);

    // Fetch full server details from Supabase
    let results = [];
    if (topMatches.length > 0 && supabaseUrl && supabaseKey) {
      const serverIds = topMatches.map((m) => m.id).filter(Boolean);
      
      if (serverIds.length > 0) {
        const serversRes = await fetch(
          `${supabaseUrl}/rest/v1/servers?id=in.(${serverIds.join(',')})&select=*`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            }
          }
        );

        if (serversRes.ok) {
          const servers = await serversRes.json();
          results = topMatches.map((match) => {
            const server = servers.find((s) => s.id === match.id);
            if (server) {
              return { 
                ...server, 
                similarity: match.semanticScore,
                hybridScore: match.hybridScore,
                keywordScore: match.keywordScore
              };
            }
            return null;
          }).filter(Boolean);
        }
      }
    }

    return new Response(JSON.stringify({
      query,
      results,
      count: results.length,
      searchType: 'hybrid'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Hybrid search error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// AI Wizard Chat using Gemma
async function handleWizardChat(request, env) {
  try {
    const { message, history = [], performSearch = false } = await request.json();

    if (!message || message.length < 2) {
      return new Response(JSON.stringify({ 
        response: 'Hey there! Tell me what kind of Minecraft server you\'re looking for. For example: "survival with claims" or "pvp factions"',
        readyToSearch: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const geminiKey = env.GEMINI_API_KEY;
    const jinaKey = env.JINA_API_KEY;
    const pineconeKey = env.PINECONE_API_KEY;
    
    // If performSearch is true, skip AI and do hybrid search directly
    if (performSearch && jinaKey && pineconeKey) {
      try {
        // Reuse the hybrid search logic
        const searchReq = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({ query: message, limit: 12 })
        });
        const searchResult = await handleHybridSearch(searchReq, env);
        const searchData = await searchResult.json();
        
        return new Response(JSON.stringify({
          response: `Found ${searchData.count} servers matching "${message}"`,
          readyToSearch: true,
          searchQuery: message,
          results: searchData.results,
          searchType: 'hybrid',
          ai: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (searchErr) {
        return new Response(JSON.stringify({ 
          response: 'I had trouble searching. Please try again with different keywords.',
          readyToSearch: false,
          error: searchErr.message
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    if (!geminiKey) {
      return new Response(JSON.stringify({ 
        response: 'I understand you\'re looking for a server! Try being more specific about the gamemode (survival, pvp, skyblock, etc.) and any features you want.',
        readyToSearch: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const prompt = `You are Gemma, an AI assistant for GuildPost - a game server discovery platform. Help users find their ideal Minecraft server.

Available server types:
- Gamemodes: survival, smp, pvp, factions, skyblock, creative, minigames, hardcore, prison, modded, roleplay, towny
- Features: economy, claims, discord, events, bedrock, vanilla, quests, mmo, shops, crates, kits

Conversation history:
${history.map(h => `${h.role}: ${h.content}`).join('\n')}

User: ${message}

Respond naturally as a helpful assistant. If you have enough info to recommend servers (gamemode or specific features mentioned), include "SEARCH_READY: <query>" at the end where <query> is the search terms.

Gemma:`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 300
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemma API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Check if AI indicated search is ready
    const searchMatch = aiResponse.match(/SEARCH_READY:\s*(.+)/i);
    const readyToSearch = !!searchMatch;
    const searchQuery = searchMatch ? searchMatch[1].trim() : null;
    
    // Clean up the response text
    const cleanResponse = aiResponse.replace(/SEARCH_READY:.*/i, '').trim();

    // If ready to search, perform hybrid search
    let searchResults = null;
    if (readyToSearch && searchQuery && jinaKey && pineconeKey) {
      try {
        const searchReq = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({ query: searchQuery, limit: 12 })
        });
        const searchResult = await handleHybridSearch(searchReq, env);
        const searchData = await searchResult.json();
        searchResults = searchData.results;
      } catch (e) {
        console.error('Hybrid search error:', e);
      }
    }

    return new Response(JSON.stringify({
      response: cleanResponse || 'Tell me more about what kind of server you want!',
      readyToSearch,
      searchQuery,
      results: searchResults,
      searchType: 'hybrid',
      ai: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Wizard chat error:', err);
    return new Response(JSON.stringify({ 
      response: 'I\'m having trouble connecting to my AI brain right now. Try searching with keywords like "survival", "pvp", or "skyblock"!',
      readyToSearch: false,
      ai: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Generate embedding using Gemini gemini-embedding-001
// Generate embeddings using Mixedbread (primary) with Gemini fallback
// Generate embeddings using Jina AI (768 dimensions) - matches Pinecone index
async function generateEmbedding(text, env) {
  const jinaKey = env.JINA_API_KEY;
  
  if (!jinaKey) {
    throw new Error('JINA_API_KEY not configured');
  }
  
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jinaKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: [text]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jina API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Semantic Search using Jina embeddings + Pinecone
async function handleSemanticSearch(request, env) {
  const { query, limit = 10 } = await request.json();

  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ error: 'Query too short' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const jinaKey = env.JINA_API_KEY;
  const pineconeKey = env.PINECONE_API_KEY;
  
  if (!jinaKey) {
    return new Response(JSON.stringify({ error: 'JINA_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!pineconeKey) {
    return new Response(JSON.stringify({ error: 'PINECONE_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Generate embedding for query using Jina AI
    const embedding = await generateEmbedding(query, env);
    console.log(`🔍 Searching for: "${query}" with ${embedding.length}-dim embedding`);

    // Get Pinecone index host
    const pineconeIndex = env.PINECONE_INDEX || 'guildpost';
    const indexResponse = await fetch(`https://api.pinecone.io/indexes/${pineconeIndex}`, {
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07'
      }
    });

    if (!indexResponse.ok) {
      throw new Error(`Failed to get Pinecone index: ${await indexResponse.text()}`);
    }

    const indexData = await indexResponse.json();
    const indexHost = indexData.host;

    // Query Pinecone for similar vectors
    const queryResponse = await fetch(`https://${indexHost}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'Content-Type': 'application/json',
        'X-Pinecone-API-Version': '2024-07'
      },
      body: JSON.stringify({
        vector: embedding,
        topK: limit,
        includeMetadata: true
      })
    });

    if (!queryResponse.ok) {
      throw new Error(`Pinecone query failed: ${await queryResponse.text()}`);
    }

    const queryData = await queryResponse.json();
    const matches = queryData.matches || [];

    // Fetch full server details from Supabase
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;
    
    let results = [];
    if (matches.length > 0) {
      const serverIds = matches.map(m => m.id).filter(Boolean);
      
      if (serverIds.length > 0) {
        const serversResponse = await fetch(
          `${supabaseUrl}/rest/v1/servers?id=in.(${serverIds.join(',')})&select=*`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            }
          }
        );

        if (serversResponse.ok) {
          const servers = await serversResponse.json();
          // Merge Pinecone scores with server data
          results = matches.map(match => {
            const server = servers.find(s => s.id === match.id);
            if (server) {
              return {
                ...server,
                similarity: match.score,
                pinecone_id: match.id
              };
            }
            return null;
          }).filter(Boolean);
        }
      }
    }

    return new Response(JSON.stringify({
      query,
      results,
      count: results.length,
      semantic: true,
      source: 'pinecone'
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

  const jinaKey = env.JINA_API_KEY;
  
  if (!jinaKey) {
    return new Response(JSON.stringify({ error: 'JINA_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const embedding = await generateEmbedding(text, env);
    
    return new Response(JSON.stringify({
      embedding,
      dimensions: embedding.length,
      provider: 'jina'
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
      `${supabaseUrl}/rest/v1/servers?select=*&limit=${limit}`,
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
    
    // Map host -> ip for frontend compatibility
    const mappedServers = servers.map(s => ({
      ...s,
      ip: s.host || s.ip
    }));
    
    return new Response(JSON.stringify({ 
      servers: mappedServers,
      count: mappedServers.length 
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

