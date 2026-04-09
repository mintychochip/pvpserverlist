import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Call Gemma API for AI-powered responses
async function callGemma(message: string, history: any[], apiKey: string) {
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${apiKey}`,
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Generate embedding using Jina AI
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: [text]
    })
  });

  if (!response.ok) {
    throw new Error(`Jina API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Hybrid Search: Keyword + Semantic
async function hybridSearch(query: string, limit: number, env: any) {
  const jinaKey = env.JINA_API_KEY;
  const pineconeKey = env.PINECONE_API_KEY;
  const supabaseUrl = env.PUBLIC_SUPABASE_URL;
  const supabaseKey = env.PUBLIC_SUPABASE_ANON_KEY;

  if (!jinaKey || !pineconeKey) {
    throw new Error('API keys not configured');
  }

  // Generate embedding for semantic search
  const embedding = await generateEmbedding(query, jinaKey);

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
      topK: limit * 2, // Get more for hybrid ranking
      includeMetadata: true
    })
  });

  if (!queryResponse.ok) {
    throw new Error(`Pinecone query error: ${await queryResponse.text()}`);
  }

  const queryData = await queryResponse.json();
  const semanticMatches = queryData.matches || [];

  // Keyword boost - filter and re-rank based on keyword matches
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  
  const scoredResults = semanticMatches.map((match: any) => {
    let keywordScore = 0;
    const metadata = match.metadata || {};
    const textToSearch = [
      metadata.name,
      metadata.description,
      metadata.gamemode,
      ...(metadata.tags || [])
    ].join(' ').toLowerCase();

    // Count keyword matches
    for (const keyword of keywords) {
      if (textToSearch.includes(keyword)) {
        keywordScore += 0.1; // Boost for each keyword match
      }
    }

    // Combine semantic score with keyword score
    const hybridScore = match.score + keywordScore;
    
    return {
      ...match,
      hybridScore,
      semanticScore: match.score,
      keywordScore
    };
  });

  // Sort by hybrid score and take top results
  scoredResults.sort((a: any, b: any) => b.hybridScore - a.hybridScore);
  const topMatches = scoredResults.slice(0, limit);

  // Fetch full server details from Supabase
  let results: any[] = [];
  if (topMatches.length > 0 && supabaseUrl && supabaseKey) {
    const serverIds = topMatches.map((m: any) => m.id).filter(Boolean);
    
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
        results = topMatches.map((match: any) => {
          const server = servers.find((s: any) => s.id === match.id);
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

  return {
    results,
    count: results.length,
    query,
    searchType: 'hybrid'
  };
}

export const POST: APIRoute = async ({ request }) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Get API keys from environment (supports both Vite import.meta.env and Cloudflare process.env)
    const env = { ...import.meta.env, ...process.env };
    const geminiKey = env.GEMINI_API_KEY;
    
    // If performSearch is true, skip AI and do hybrid search directly
    if (performSearch) {
      try {
        const searchResults = await hybridSearch(message, 12, env);
        return new Response(JSON.stringify({
          response: `Found ${searchResults.count} servers matching "${message}"`,
          readyToSearch: true,
          searchQuery: message,
          results: searchResults.results,
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
      // Fallback to basic responses if no API key
      return new Response(JSON.stringify({ 
        response: 'I understand you\'re looking for a server! Try being more specific about the gamemode (survival, pvp, skyblock, etc.) and any features you want.',
        readyToSearch: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call Gemma AI
    const aiResponse = await callGemma(message, history, geminiKey);
    
    // Check if AI indicated search is ready
    const searchMatch = aiResponse.match(/SEARCH_READY:\s*(.+)/i);
    const readyToSearch = !!searchMatch;
    const searchQuery = searchMatch ? searchMatch[1].trim() : null;
    
    // Clean up the response text
    const cleanResponse = aiResponse.replace(/SEARCH_READY:.*/i, '').trim();

    // If ready to search, perform hybrid search
    let searchResults = null;
    if (readyToSearch && searchQuery) {
      try {
        searchResults = await hybridSearch(searchQuery, 12, env);
      } catch (e) {
        console.error('Hybrid search error:', e);
      }
    }

    return new Response(JSON.stringify({
      response: cleanResponse || 'Tell me more about what kind of server you want!',
      readyToSearch,
      searchQuery,
      results: searchResults?.results,
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
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
