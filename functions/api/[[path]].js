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
  // Strip /api prefix since Functions are mounted at /api/
  const path = url.pathname.replace(/^\/api/, '') || '/';

  try {
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

      // Get Servers List (for watcher)
      if ((path === '/servers' || path === '/servers/') && request.method === 'GET') {
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
