import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

const mockFetch = vi.fn();

describe('POST /api/search/semantic', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    // Set up process.env for import.meta.env compatibility
    process.env.JINA_API_KEY = 'test-jina-key';
    process.env.PINECONE_API_KEY = 'test-pinecone-key';
    process.env.PINECONE_INDEX = 'guildpost';
    process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.PUBLIC_SUPABASE_ANON_KEY = 'test-supabase-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    global.fetch = mockFetch;
  });

  it('returns 400 for queries shorter than 2 characters', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'x' }) } as any;
    
    const response = await POST({ request } as any);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Query too short');
  });

  it('returns 500 when API keys are missing', async () => {
    // Temporarily remove env vars
    const prevJina = process.env.JINA_API_KEY;
    const prevPinecone = process.env.PINECONE_API_KEY;
    process.env.JINA_API_KEY = '';
    process.env.PINECONE_API_KEY = '';
    
    vi.resetModules();
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'survival server' }) } as any;
    
    const response = await POST({ request } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('API keys not configured');
    
    // Restore env
    process.env.JINA_API_KEY = prevJina;
    process.env.PINECONE_API_KEY = prevPinecone;
  });

  it('performs semantic search and returns results', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'survival server', limit: 3 }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: [{ embedding: [0.5, 0.3, 0.2, 0.1] }]
          })
        } as Response);
      }
      
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ host: 'semantic-index.pinecone.io' })
        } as Response);
      }
      
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            matches: [
              { id: 'srv-1', score: 0.92, metadata: { name: 'Vanilla Survival', description: 'Pure survival' } },
              { id: 'srv-2', score: 0.85, metadata: { name: 'Hardcore SMP', description: 'Hard survival' } },
              { id: 'srv-3', score: 0.78, metadata: { name: 'Creative Hub', description: 'Building server' } }
            ]
          })
        } as Response);
      }
      
      if (urlStr.includes('supabase.co')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'srv-1', name: 'Vanilla Survival', players_online: 45 },
            { id: 'srv-2', name: 'Hardcore SMP', players_online: 32 },
            { id: 'srv-3', name: 'Creative Hub', players_online: 28 }
          ])
        } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request } as any);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.query).toBe('survival server');
    expect(data.semantic).toBe(true);
    expect(data.source).toBe('pinecone');
    expect(data.results).toHaveLength(3);
    expect(data.count).toBe(3);
    
    // Results should have similarity scores
    expect(data.results[0].similarity).toBe(0.92);
    expect(data.results[1].similarity).toBe(0.85);
    expect(data.results[2].similarity).toBe(0.78);
  });

  it('uses jina-embeddings-v3 with retrieval.query task', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test' }) } as any;
    
    let jinaBody: any = null;
    
    mockFetch.mockImplementation((url: string | Request | URL, init?: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        jinaBody = JSON.parse(init?.body || '{}');
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ matches: [] }) } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    await POST({ request } as any);
    
    expect(jinaBody).not.toBeNull();
    expect(jinaBody.model).toBe('jina-embeddings-v3');
    expect(jinaBody.task).toBe('retrieval.query');
    expect(jinaBody.input).toEqual(['test']);
  });

  it('handles empty semantic search results', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'xyzabc123' }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ matches: [] }) } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request } as any);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(0);
    expect(data.count).toBe(0);
    expect(data.semantic).toBe(true);
  });

  it('returns 500 on Jina API error', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test query' }) } as any;
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Invalid API key')
    } as Response);
    
    const response = await POST({ request } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Jina API error');
  });

  it('returns 500 on Pinecone index error', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test' }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL, init?: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: false, text: () => Promise.resolve('Unauthorized') } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Pinecone index error');
  });

  it('returns 500 on Pinecone query error', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test' }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL, init?: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({ ok: false, text: () => Promise.resolve('Index not ready') } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Pinecone query error');
  });

  it('applies CORS headers to response', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test' }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ matches: [] }) } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request } as any);
    
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('uses default limit of 10 when not specified', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test' }) } as any;
    
    let capturedBody: any = null;
    
    mockFetch.mockImplementation((url: string | Request | URL, init?: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        capturedBody = JSON.parse(init?.body || '{}');
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ matches: [] }) } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    await POST({ request } as any);
    
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.topK).toBe(10);
  });

  it('handles missing Supabase config gracefully', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test' }) } as any;
    
    // Remove Supabase env vars temporarily
    const prevSupaUrl = process.env.PUBLIC_SUPABASE_URL;
    const prevSupaKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
    process.env.PUBLIC_SUPABASE_URL = '';
    process.env.PUBLIC_SUPABASE_ANON_KEY = '';
    
    vi.resetModules();
    const { POST: POST_NO_SUPABASE } = await import('../src/pages/api/search/semantic');
    
    mockFetch.mockImplementation((url: string | Request | URL) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            matches: [{ id: 'srv-1', score: 0.9, metadata: { name: 'Test' } }]
          })
        } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST_NO_SUPABASE({ request } as any);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    // Without Supabase, results should be empty since we can't fetch server details
    expect(data.results).toHaveLength(0);
    
    // Restore env
    process.env.PUBLIC_SUPABASE_URL = prevSupaUrl;
    process.env.PUBLIC_SUPABASE_ANON_KEY = prevSupaKey;
  });

  it('filters results to only include servers found in Supabase', async () => {
    const { POST } = await import('../src/pages/api/search/semantic');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'pvp' }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            matches: [
              { id: 'active-1', score: 0.95, metadata: { name: 'Active 1' } },
              { id: 'active-2', score: 0.88, metadata: { name: 'Active 2' } },
              { id: 'orphaned', score: 0.75, metadata: { name: 'Orphaned' } }
            ]
          })
        } as Response);
      }
      if (urlStr.includes('supabase.co')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'active-1', name: 'Active Server 1' },
            { id: 'active-2', name: 'Active Server 2' }
          ])
        } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request } as any);
    const data = await response.json();
    
    expect(data.results).toHaveLength(2);
    expect(data.results.every((r: any) => r.id.startsWith('active'))).toBe(true);
  });
});

describe('OPTIONS /api/search/semantic', () => {
  it('returns CORS headers for preflight', async () => {
    const { OPTIONS } = await import('../src/pages/api/search/semantic');
    const response = await OPTIONS();
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
