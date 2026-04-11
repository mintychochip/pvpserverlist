import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIContext } from 'astro';

// Create mock functions that we can control
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

// Build the mock chain object
const mockSupabaseChain = {
  from: mockFrom,
  select: mockSelect,
  eq: mockEq,
  single: mockSingle
};

// Mock the supabase client
vi.mock('../src/lib/supabase', () => ({
  supabase: mockSupabaseChain
}));

const createMockContext = (params: any, searchParams: Record<string, string> = {}): any => ({
  params,
  request: {
    url: `http://localhost:4321/api/widgets/${params.id}?${new URLSearchParams(searchParams)}`
  }
});

describe('Widgets API', () => {
  const mockServerData = (overrides = {}) => ({
    id: 'test-id',
    name: 'Test Server',
    ip: 'play.test.com',
    port: 25565,
    description: 'A test server',
    tags: ['pvp', 'survival'],
    version: '1.20.4',
    vote_count: 42,
    server_status: [{
      online: true,
      players_online: 150,
      players_max: 500,
      latency_ms: 45,
      updated_at: '2026-04-11T08:00:00Z'
    }],
    ...overrides
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup chaining - each call returns the chain object
    mockFrom.mockReturnValue(mockSupabaseChain);
    mockSelect.mockReturnValue(mockSupabaseChain);
    mockEq.mockReturnValue(mockSupabaseChain);
    // Default: return valid server data (tests can override for error cases)
    mockSingle.mockResolvedValue({ data: mockServerData(), error: null });
  });

  it('returns 400 when server ID is missing', async () => {
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: undefined });
    
    const response = await GET(context);
    expect(response.status).toBe(400);
    
    const data = await response.json();
    expect(data.error).toBe('Server ID required');
  });

  it('returns 404 when server is not found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error('Not found') });
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'non-existent-id' });
    
    const response = await GET(context);
    expect(response.status).toBe(404);
    
    const data = await response.json();
    expect(data.error).toBe('Server not found');
  });

  it('returns JSON data for valid server', async () => {
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'test-id' }, { format: 'json' });
    
    const response = await GET(context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    
    const data = await response.json();
    expect(data.id).toBe('test-id');
    expect(data.name).toBe('Test Server');
    expect(data.status).toBe('online');
    expect(data.players.online).toBe(150);
    expect(data.players.max).toBe(500);
    expect(data.votes).toBe(42);
  });

  it('returns offline status when server is down', async () => {
    mockSingle.mockResolvedValue({ 
      data: mockServerData({ 
        server_status: [{ online: false, players_online: 0, players_max: 0, latency_ms: null, updated_at: '2026-04-11T07:00:00Z' }]
      }), 
      error: null 
    });
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'offline-id' }, { format: 'json' });
    
    const response = await GET(context);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('offline');
    expect(data.players.online).toBe(0);
  });

  it('returns SVG banner via PNG format endpoint', async () => {
    // Note: The API uses format=png to generate SVG banners
    // (PNG conversion is planned but currently returns SVG)
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'test-id' }, { format: 'png', theme: 'dark' });
    
    const response = await GET(context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    
    const svg = await response.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('Test Server');
    // Status is shown via colored dot, not text
  });

  it('returns SVG via PNG endpoint with default theme', async () => {
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'test-id' }, { format: 'png' });
    
    const response = await GET(context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('handles servers without status history', async () => {
    mockSingle.mockResolvedValue({ 
      data: mockServerData({ server_status: [] }), 
      error: null 
    });
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'new-server' }, { format: 'json' });
    
    const response = await GET(context);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('offline');
    expect(data.players.online).toBe(0);
  });

  it('returns 400 for unsupported format', async () => {
    // format=svg is not supported - only json, html, png
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'test-id' }, { format: 'svg', theme: 'invalid' });
    
    const response = await GET(context);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid format');
  });

  it('handles database errors as 404', async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error('Database connection failed') });
    
    vi.resetModules();
    const { GET } = await import('../src/pages/api/widgets/[id]');
    const context = createMockContext({ id: 'test-id' });
    
    const response = await GET(context);
    expect(response.status).toBe(404);
    
    const data = await response.json();
    expect(data.error).toBe('Server not found');
  });
});
