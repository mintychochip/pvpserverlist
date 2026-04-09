import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

export const POST: APIRoute = async ({ request }) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 12 } = await request.json();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ error: 'Query too short' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get API keys from environment (supports both Vite import.meta.env and Cloudflare process.env)
    const jinaKey = import.meta.env.JINA_API_KEY || process.env.JINA_API_KEY;
    const pineconeKey = import.meta.env.PINECONE_API_KEY || process.env.PINECONE_API_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
    const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

    if (!jinaKey || !pineconeKey) {
      return new Response(JSON.stringify({ error: 'API keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate embedding for semantic search
    const embedding = await generateEmbedding(query, jinaKey);

    // Get Pinecone index host
    const pineconeIndex = import.meta.env.PINECONE_INDEX || 'guildpost';
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
    
    const scoredResults = semanticMatches.map((match: any) => {
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
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
