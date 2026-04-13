import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Uptime API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.stubGlobal('process', { env: {} });
  });

  describe('GET /api/servers/[id]/uptime', () => {
    it('should return uptime data with ping history', async () => {
      const mockPings = [
        { created_at: '2026-04-13T10:00:00Z', players_online: 50, max_players: 100, ping_ms: 45 },
        { created_at: '2026-04-13T09:00:00Z', players_online: 45, max_players: 100, ping_ms: 42 },
        { created_at: '2026-04-13T08:00:00Z', players_online: 30, max_players: 100, ping_ms: 50 },
      ];

      const mockServer = [{ players_online: 50, max_players: 100, status: 'online', uptime_percentage: 99.5 }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPings),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockServer),
        });

      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.GET({
        params: { id: 'test-server-123' },
        request: { url: 'http://localhost/api/servers/test-server-123/uptime?days=1' },
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'test-key' } } },
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.server_id).toBe('test-server-123');
      expect(data.period).toBe('1d');
      expect(data.stats.total_pings).toBe(3);
      expect(data.stats.avg_players).toBe(42); // rounded average of 50, 45, 30
      expect(data.chart_data).toHaveLength(3);
    });

    it('should aggregate daily data when days > 1', async () => {
      const mockPings = [
        { created_at: '2026-04-13T10:00:00Z', players_online: 50, max_players: 100, ping_ms: 45 },
        { created_at: '2026-04-13T14:00:00Z', players_online: 60, max_players: 100, ping_ms: 40 },
        { created_at: '2026-04-12T10:00:00Z', players_online: 40, max_players: 100, ping_ms: 48 },
        { created_at: '2026-04-12T15:00:00Z', players_online: 55, max_players: 100, ping_ms: 44 },
      ];

      const mockServer = [{ players_online: 50, max_players: 100, status: 'online', uptime_percentage: 98.0 }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPings),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockServer),
        });

      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.GET({
        params: { id: 'test-server-456' },
        request: { url: 'http://localhost/api/servers/test-server-456/uptime?days=7' },
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'test-key' } } },
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.period).toBe('7d');
      expect(data.chart_data).toHaveLength(2); // 2 days aggregated
      expect(data.chart_data[0].avg_players).toBeDefined();
    });

    it('should handle missing Supabase key', async () => {
      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.GET({
        params: { id: 'test-server' },
        request: { url: 'http://localhost/api/servers/test-server/uptime' },
        locals: { runtime: { env: {} } },
      } as any);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('Server configuration error');
    });

    it('should handle Supabase fetch errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.GET({
        params: { id: 'nonexistent-server' },
        request: { url: 'http://localhost/api/servers/nonexistent-server/uptime' },
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'test-key' } } },
      } as any);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should handle empty ping history gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ players_online: 25, max_players: 100, status: 'online', uptime_percentage: 100 }]),
        });

      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.GET({
        params: { id: 'new-server' },
        request: { url: 'http://localhost/api/servers/new-server/uptime' },
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'test-key' } } },
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.stats.total_pings).toBe(0);
      expect(data.stats.avg_players).toBe(0);
      expect(data.chart_data).toHaveLength(0);
    });

    it('should calculate peak players correctly', async () => {
      const mockPings = [
        { created_at: '2026-04-13T08:00:00Z', players_online: 10, max_players: 100, ping_ms: 50 },
        { created_at: '2026-04-13T09:00:00Z', players_online: 100, max_players: 100, ping_ms: 35 },
        { created_at: '2026-04-13T10:00:00Z', players_online: 75, max_players: 100, ping_ms: 40 },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPings),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ players_online: 80, max_players: 100 }]),
        });

      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.GET({
        params: { id: 'test-server' },
        request: { url: 'http://localhost/api/servers/test-server/uptime' },
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'test-key' } } },
      } as any);

      const data = await response.json();
      expect(data.stats.peak_players).toBe(100);
    });

    it('should handle pings without latency data', async () => {
      const mockPings = [
        { created_at: '2026-04-13T08:00:00Z', players_online: 50, max_players: 100, ping_ms: null },
        { created_at: '2026-04-13T09:00:00Z', players_online: 55, max_players: 100, ping_ms: 45 },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPings),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ players_online: 50 }]),
        });

      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.GET({
        params: { id: 'test-server' },
        request: { url: 'http://localhost/api/servers/test-server/uptime' },
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'test-key' } } },
      } as any);

      const data = await response.json();
      expect(data.stats.avg_latency).toBe(45); // only counts the ping with latency
    });
  });

  describe('OPTIONS /api/servers/[id]/uptime', () => {
    it('should return CORS headers', async () => {
      const module = await import('../src/pages/api/servers/[id]/uptime.ts');
      const response = await module.OPTIONS();

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });
  });
});
