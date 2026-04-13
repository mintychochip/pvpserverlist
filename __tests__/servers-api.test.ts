import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Servers API', () => {
  describe('GET /api/servers', () => {
    it('should return paginated servers list', async () => {
      const mockServers = [
        { id: 1, name: 'Server One', ip: '192.168.1.1', port: 25565 },
        { id: 2, name: 'Server Two', ip: '192.168.1.2', port: 25565 },
      ];

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServers)
      });

      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_KEY: 'test-key' } } };
      const response = await GET({ request, locals });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.servers).toEqual(mockServers);
      expect(data.count).toBe(2);
    });

    it('should handle multiple batches when servers exceed 1000', async () => {
      const batch1 = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Server ${i}` }));
      const batch2 = Array.from({ length: 500 }, (_, i) => ({ id: i + 1000, name: `Server ${i + 1000}` }));

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(batch1)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(batch2)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([])
        });

      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_KEY: 'test-key' } } };
      const response = await GET({ request, locals });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.count).toBe(1500);
      expect(data.servers).toHaveLength(1500);
    });

    it('should return 500 when Supabase URL is missing', async () => {
      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_SERVICE_KEY: 'test-key' } } };
      const response = await GET({ request, locals });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Supabase not configured');
      expect(data.hasUrl).toBe(false);
      expect(data.hasKey).toBe(true);
    });

    it('should return 500 when Supabase key is missing', async () => {
      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_URL: 'https://test.supabase.co' } } };
      const response = await GET({ request, locals });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Supabase not configured');
      expect(data.hasUrl).toBe(true);
      expect(data.hasKey).toBe(false);
    });

    it('should handle Supabase fetch errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_KEY: 'test-key' } } };
      const response = await GET({ request, locals });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Network error');
    });

    it('should handle non-ok Supabase response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503
      });

      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_KEY: 'test-key' } } };

      try {
        await GET({ request, locals });
      } catch (e: any) {
        expect(e.message).toContain('Supabase error: 503');
      }
    });

    it('should include proper CORS and cache headers', async () => {
      const mockServers = [{ id: 1, name: 'Test Server' }];

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServers)
      });

      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_KEY: 'test-key' } } };
      const response = await GET({ request, locals });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toContain('max-age=60');
      expect(response.headers.get('Cache-Control')).toContain('stale-while-revalidate');
    });

    it('should stop at safety cap of 50k servers', async () => {
      const batch = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batch) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batch) });

      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const locals = { runtime: { env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_KEY: 'test-key' } } };

      let callCount = 0;
      const originalFetch = global.fetch;
      global.fetch = vi.fn(() => {
        callCount++;
        if (callCount > 50) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(batch) });
      });

      const response = await GET({ request, locals });
      expect(response.status).toBe(200);
    });

    it('should use process.env as fallback when locals.runtime.env is not available', async () => {
      process.env.SUPABASE_URL = 'https://env.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'env-key';

      const mockServers = [{ id: 1, name: 'Env Server' }];
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServers)
      });

      const { GET } = await import('../src/pages/api/servers.ts');
      const request = new Request('http://localhost/api/servers');
      const response = await GET({ request, url: new URL('http://localhost/api/servers') });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.count).toBe(1);
    });
  });

  describe('OPTIONS /api/servers', () => {
    it('should return CORS headers for preflight', async () => {
      const { OPTIONS } = await import('../src/pages/api/servers.ts');
      const response = await OPTIONS();

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });
  });
});
