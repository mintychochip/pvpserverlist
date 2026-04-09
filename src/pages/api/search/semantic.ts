import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const POST: APIRoute = async ({ request }) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 10 } = await request.json();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ error: 'Query too short' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get env vars
    const jinaKey = import.meta.env.JINA_API_KEY;
    const pineconeKey = import.meta.env.PINECONE_API_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

    if (!jinaKey || !pineconeKey) {
      return new Response(JSON.stringify({ error: 'API keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate embedding with Jina
    const embedRes = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jinaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v3',
        task: 'retrieval.query',
        input: [query]
      })
    });

    if (!embedRes.ok) {
      throw new Error(`Jina API error: ${await embedRes.text()}`);
    }

    const embedData = await embedRes.json();
    const embedding = embedData.data[0].embedding;

    // Get Pinecone index host
    const pineconeIndex = import.meta.env.PINECONE_INDEX || 'guildpost';
    const indexRes = await fetch(`https://api.pinecone.io/indexes/${pineconeIndex}`, {
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07'
      }
    });

    if (!indexRes.ok) {
      throw new Error(`Pinecone index error: ${await indexRes.text()}`);
    }

    const indexData = await indexRes.json();
    const indexHost = indexData.host;

    // Query Pinecone
    const queryRes = await fetch(`https://${indexHost}/query`, {
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

    if (!queryRes.ok) {
      throw new Error(`Pinecone query error: ${await queryRes.text()}`);
    }

    const queryData = await queryRes.json();
    const matches = queryData.matches || [];

    // Fetch server details from Supabase
    let results = [];
    if (matches.length > 0 && supabaseUrl && supabaseKey) {
      const serverIds = matches.map(m => m.id).filter(Boolean);
      
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
          results = matches.map(match => {
            const server = servers.find(s => s.id === match.id);
            if (server) {
              return { ...server, similarity: match.score };
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
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
