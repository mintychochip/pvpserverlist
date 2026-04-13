import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();

// Mock locals with Cloudflare-style runtime env
const createMockLocals = (env = {}) => ({
  runtime: {
    env: {
      JINA_API_KEY: 'test-jina-key',
      PINECONE_API_KEY: 'test-pinecone-key',
      PINECONE_INDEX: 'guildpost',
      PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'test-supabase-key',
      ...env
    }
  }
});

describe('POST /api/search/hybrid', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = mockFetch;
  });

  it('returns 400 for queries shorter than 2 characters', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'a' }) } as any;
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Query too short');
  });

  it('returns 500 when API keys are missing', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'pvp server' }) } as any;
    const locals = createMockLocals({ JINA_API_KEY: undefined });
    
    const response = await POST({ request, locals } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('API keys not configured');
  });

  it('performs hybrid search with keyword boosting', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'pvp factions', limit: 5 }) } as any;
    
    // Mock Jina embedding
    mockFetch.mockImplementation((url: string | Request | URL) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
        } as Response);
      }
      
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ host: 'test-index.pinecone.io' })
        } as Response);
      }
      
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            matches: [
              { id: 'srv-1', score: 0.85, metadata: { name: 'PVP Factions', description: 'Best pvp', gamemode: 'pvp', tags: ['factions'] } },
              { id: 'srv-2', score: 0.75, metadata: { name: 'Survival', description: 'vanilla survival', gamemode: 'survival', tags: [] } },
              { id: 'srv-3', score: 0.70, metadata: { name: 'Hardcore PVP', description: 'pvp action', gamemode: 'pvp', tags: ['hardcore'] } }
            ]
          })
        } as Response);
      }
      
      if (urlStr.includes('supabase.co')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'srv-1', name: 'PVP Factions Server', players_online: 50 },
            { id: 'srv-2', name: 'Survival Server', players_online: 20 },
            { id: 'srv-3', name: 'Hardcore PVP Server', players_online: 30 }
          ])
        } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.query).toBe('pvp factions');
    expect(data.searchType).toBe('hybrid');
    expect(data.results.length).toBeGreaterThan(0);
    
    // PVP Factions should be boosted due to keyword matches
    const topResult = data.results[0];
    expect(topResult.hybridScore).toBeDefined();
    expect(topResult.similarity).toBeDefined();
    expect(topResult.keywordScore).toBeGreaterThan(0);
  });

  it('handles empty search results', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'xyznonexistent' }) } as any;
    
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
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(0);
    expect(data.count).toBe(0);
  });

  it('returns 500 on Jina API error', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test query' }) } as any;
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Rate limit exceeded')
    } as Response);
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Jina API error');
  });

  it('returns 500 on Pinecone index error', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test query' }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL, init?: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: false, text: () => Promise.resolve('Index not found') } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Pinecone index error');
  });

  it('returns 500 on Pinecone query error', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
    const request = { method: 'POST', json: () => Promise.resolve({ query: 'test query' }) } as any;
    
    mockFetch.mockImplementation((url: string | Request | URL, init?: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('api.jina.ai')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }) } as Response);
      }
      if (urlStr.includes('api.pinecone.io/indexes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ host: 'test.pinecone.io' }) } as Response);
      }
      if (urlStr.includes('pinecone.io/query')) {
        return Promise.resolve({ ok: false, text: () => Promise.resolve('Query failed') } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Pinecone query error');
  });

  it('applies CORS headers to response', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
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
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('filters out servers not found in Supabase', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
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
              { id: 'srv-1', score: 0.9, metadata: { name: 'Server 1' } },
              { id: 'srv-2', score: 0.8, metadata: { name: 'Server 2' } },
              { id: 'srv-deleted', score: 0.7, metadata: { name: 'Deleted Server' } }
            ]
          })
        } as Response);
      }
      if (urlStr.includes('supabase.co')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'srv-1', name: 'Server 1' },
            { id: 'srv-2', name: 'Server 2' }
          ])
        } as Response);
      }
      
      return Promise.resolve({ ok: true } as Response);
    });
    
    const response = await POST({ request, locals: createMockLocals() } as any);
    const data = await response.json();
    
    expect(data.results).toHaveLength(2);
    expect(data.results.map((r: any) => r.id)).not.toContain('srv-deleted');
  });

  it('uses default limit of 12 when not specified', async () => {
    const { POST } = await import('../src/pages/api/search/hybrid');
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
    
    await POST({ request, locals: createMockLocals() } as any);
    
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.topK).toBe(24); // limit * 2 for hybrid ranking
  });
});

describe('OPTIONS /api/search/hybrid', () => {
  it('returns CORS headers for preflight', async () => {
    const { OPTIONS } = await import('../src/pages/api/search/hybrid');
    const response = await OPTIONS();
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
