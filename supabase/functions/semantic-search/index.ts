import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Pinecone client for Deno with hybrid search support
class PineconeClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = '';
  }

  async index(name: string) {
    // Get index details from Pinecone API
    const response = await fetch(`https://api.pinecone.io/indexes/${name}`, {
      headers: {
        'Api-Key': this.apiKey,
        'X-Pinecone-API-Version': '2024-07'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get index details: ${await response.text()}`);
    }
    
    const indexData = await response.json();
    this.baseUrl = `https://${indexData.host}`;

    return {
      // Standard dense vector query
      query: async (params: {
        vector: number[];
        topK: number;
        includeMetadata?: boolean;
        filter?: Record<string, any>;
      }) => {
        const response = await fetch(`${this.baseUrl}/query`, {
          method: 'POST',
          headers: {
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json',
            'X-Pinecone-API-Version': '2024-07'
          },
          body: JSON.stringify({
            vector: params.vector,
            topK: params.topK,
            includeMetadata: params.includeMetadata,
            filter: params.filter
          })
        });

        if (!response.ok) {
          throw new Error(`Pinecone error: ${await response.text()}`);
        }

        return await response.json();
      },

      // Hybrid search with text (uses Pinecone's integrated inference)
      searchRecords: async (params: {
        query: {
          inputs: { text: string };
          topK: number;
        };
        fields?: string[];
      }) => {
        const response = await fetch(`${this.baseUrl}/records/search`, {
          method: 'POST',
          headers: {
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json',
            'X-Pinecone-API-Version': '2024-10'
          },
          body: JSON.stringify(params)
        });

        if (!response.ok) {
          throw new Error(`Pinecone search error: ${await response.text()}`);
        }

        return await response.json();
      }
    };
  }
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

// Generate embedding using Jina AI (768 dimensions)
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en', // 768 dims
      input: [text]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jina API error: ${error}`);
  }

  const data = await response.json();
  const embedding = data.data[0].embedding;
  console.log(`📐 Generated ${embedding.length}-dim embedding`);
  return embedding;
}

// Generate sparse vector for keyword matching (BM25-like)
function generateSparseVector(text: string): { indices: number[]; values: number[] } {
  // Simple tokenization and term frequency
  const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const termFreq = new Map<string, number>();
  
  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) || 0) + 1);
  }
  
  // Create sparse vector (using hash of term as index)
  const indices: number[] = [];
  const values: number[] = [];
  
  for (const [term, freq] of termFreq) {
    // Simple hash function for term to index
    let hash = 0;
    for (let i = 0; i < term.length; i++) {
      hash = ((hash << 5) - hash) + term.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    // Ensure positive index within reasonable range
    const idx = Math.abs(hash) % 25000;
    indices.push(idx);
    values.push(Math.log(1 + freq)); // Log TF weighting
  }
  
  return { indices, values };
}

// Main handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const pineconeKey = Deno.env.get('PINECONE_API_KEY') || '';
    const jinaKey = Deno.env.get('JINA_API_KEY') || '';
    const pineconeIndex = Deno.env.get('PINECONE_INDEX') || 'guildpost';

    if (!supabaseKey || !pineconeKey || !jinaKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required environment variables' }),
        { headers: corsHeaders, status: 500 }
      );
    }

    // Parse request body
    const { query, limit = 10, filters = {}, hybrid = true, alpha = 0.7 } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter required' }),
        { headers: corsHeaders, status: 400 }
      );
    }

    console.log(`🔍 ${hybrid ? 'Hybrid' : 'Dense'} search: "${query}" (alpha: ${alpha})`);

    // Query Pinecone
    const pinecone = new PineconeClient(pineconeKey);
    const index = await pinecone.index(pineconeIndex);

    let searchResults: any;

    if (hybrid) {
      // Hybrid search: dense + sparse
      const queryEmbedding = await generateEmbedding(query, jinaKey);
      const sparseVector = generateSparseVector(query);
      
      console.log(`📐 Dense: ${queryEmbedding.length} dims, Sparse: ${sparseVector.indices.length} terms`);

      // Try integrated inference first (if index supports it)
      try {
        searchResults = await index.searchRecords({
          query: {
            inputs: { text: query },
            topK: limit
          },
          fields: ['name', 'description', 'tags', 'version']
        });
        
        // Transform to standard format
        if (searchResults.result?.hits) {
          searchResults = {
            matches: searchResults.result.hits.map((hit: any) => ({
              id: hit._id,
              score: hit._score,
              metadata: hit.fields || {}
            }))
          };
        }
      } catch (e) {
        // Fall back to dense-only query
        console.log('Integrated inference failed, using dense-only query');
        
        searchResults = await index.query({
          vector: queryEmbedding,
          topK: limit,
          includeMetadata: true,
          filter: Object.keys(filters).length > 0 ? filters : undefined
        });
      }
    } else {
      // Dense only search
      const queryEmbedding = await generateEmbedding(query, jinaKey);
      console.log(`📐 Generated ${queryEmbedding.length}-dim embedding`);
      
      searchResults = await index.query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true,
        filter: Object.keys(filters).length > 0 ? filters : undefined
      });
    }

    console.log(`✅ Pinecone returned ${searchResults.matches?.length || 0} matches`);

    if (!searchResults.matches || searchResults.matches.length === 0) {
      return new Response(
        JSON.stringify({ 
          query, 
          results: [], 
          count: 0,
          message: 'No similar servers found',
          hybrid
        }),
        { headers: corsHeaders }
      );
    }

    // Get server IDs from Pinecone results
    const serverIds = searchResults.matches.map((m: any) => m.id);
    const scores = new Map(searchResults.matches.map((m: any) => [m.id, m.score]));

    // Fetch full server data from Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: servers, error: dbError } = await supabase
      .from('servers')
      .select('id, name, description, ip, port, status, players_online, max_players, version, tags')
      .in('id', serverIds);

    if (dbError) {
      throw dbError;
    }

    // Merge Pinecone scores with server data
    const results = (servers || [])
      .map(server => ({
        ...server,
        similarity_score: scores.get(server.id) || 0
      }))
      .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));

    return new Response(
      JSON.stringify({
        query,
        results,
        count: results.length,
        hybrid,
        semantic: true
      }),
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error('❌ Search error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: corsHeaders, status: 500 }
    );
  }
});
