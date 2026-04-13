import { describe, it, expect, vi, beforeEach } from 'vitest';

const SITE_URL = 'https://guildpost.tech';

describe('RSS Feed Endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Popular RSS Feed (/rss/popular.xml)', () => {
    it('should return RSS XML with correct content type', async () => {
      const mockServers = [
        {
          id: 'test-server-1',
          name: 'Test Server One',
          description: 'A test minecraft server',
          ip: 'test1.example.com',
          port: 25565,
          tags: ['PvP', 'Survival'],
          vote_count: 100,
          players_online: 50,
          max_players: 100,
          status: 'online',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          website: 'https://test1.example.com',
          version: '1.20+',
          edition: 'java',
        },
        {
          id: 'test-server-2',
          name: 'Test Server Two',
          description: 'Another test server',
          ip: 'test2.example.com',
          port: 25565,
          tags: ['Creative'],
          vote_count: 50,
          players_online: 25,
          max_players: 50,
          status: 'offline',
          created_at: '2024-01-05T00:00:00Z',
          updated_at: '2024-01-10T00:00:00Z',
          version: '1.19',
          edition: 'bedrock',
        },
      ];

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockServers,
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml?limit=2`),
        locals: {
          runtime: {
            env: {
              SUPABASE_URL: 'https://test.supabase.co',
              SUPABASE_SERVICE_KEY: 'test-key',
            },
          },
        },
      } as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');

      const body = await response.text();
      expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(body).toContain('<rss version="2.0"');
      expect(body).toContain('<title>GuildPost - Trending Minecraft Servers</title>');
      expect(body).toContain('Test Server One (100 votes)');
      expect(body).toContain('Test Server Two (50 votes)');
      expect(body).toContain('<link>https://guildpost.tech/servers/test-server-1</link>');
      expect(body).toContain('<description><![CDATA[');
      expect(body).toContain('⭐ 100 votes');
      expect(body).toContain('👥 50/100 players');
      expect(body).toContain('🎮 Connect: test1.example.com:25565');
      expect(body).toContain('<category>PvP</category>');
      expect(body).toContain('<category>Survival</category>');
    });

    it('should handle missing optional fields gracefully', async () => {
      const mockServers = [
        {
          id: 'minimal-server',
          name: 'Minimal Server',
          description: null,
          ip: 'minimal.example.com',
          port: 25565,
          tags: [],
          vote_count: 0,
          players_online: 0,
          max_players: 0,
          status: 'unknown',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockServers,
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: {
          runtime: {
            env: {
              SUPABASE_URL: 'https://test.supabase.co',
              SUPABASE_SERVICE_KEY: 'test-key',
            },
          },
        },
      } as any);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain('Minimal Server (0 votes)');
      expect(body).toContain('🎮 Connect: minimal.example.com:25565');
    });

    it('should default limit to 20 and cap at 50', async () => {
      const mockServers = Array(25).fill(null).map((_, i) => ({
        id: `server-${i}`,
        name: `Server ${i}`,
        description: 'Test',
        ip: `s${i}.example.com`,
        port: 25565,
        tags: [],
        vote_count: i,
        players_online: 0,
        max_players: 10,
        status: 'online',
        created_at: '2024-01-01T00:00:00Z',
      }));

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockServers,
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      
      // Test default limit (20)
      await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'key' } } },
      } as any);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=20'),
        expect.any(Object)
      );

      // Test limit capped at 50
      vi.resetAllMocks();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockServers,
      });

      await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml?limit=100`),
        locals: { runtime: { env: { SUPABASE_SERVICE_KEY: 'key' } } },
      } as any);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=50'),
        expect.any(Object)
      );
    });

    it('should return 503 when supabase key is missing', async () => {
      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: { runtime: { env: {} } },
      } as any);

      expect(response.status).toBe(503);
      expect(await response.text()).toBe('Service unavailable');
    });

    it('should return 500 on supabase error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        text: async () => 'Database error',
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: {
          runtime: {
            env: {
              SUPABASE_URL: 'https://test.supabase.co',
              SUPABASE_SERVICE_KEY: 'test-key',
            },
          },
        },
      } as any);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Failed to generate RSS feed');
    });

    it('should escape XML special characters in content', async () => {
      const mockServers = [
        {
          id: 'special-chars',
          name: 'Server <script>alert(1)</script> & "test"',
          description: 'Description with <b>HTML</b> & "quotes"',
          ip: 'test.example.com',
          port: 25565,
          tags: ['Tag<1>', 'Tag&2'],
          vote_count: 10,
          players_online: 5,
          max_players: 20,
          status: 'online',
          created_at: '2024-01-01T00:00:00Z',
          website: 'https://example.com?param=<value>&other="test"',
        },
      ];

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockServers,
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: {
          runtime: {
            env: {
              SUPABASE_URL: 'https://test.supabase.co',
              SUPABASE_SERVICE_KEY: 'test-key',
            },
          },
        },
      } as any);

      const body = await response.text();
      expect(body).toContain('Server &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;test&quot;');
      expect(body).toContain('&lt;b&gt;HTML&lt;/b&gt;');
      expect(body).toContain('&quot;quotes&quot;');
      expect(body).toContain('Tag&lt;1&gt;');
      expect(body).toContain('Tag&amp;2');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers on GET response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: {
          runtime: {
            env: {
              SUPABASE_SERVICE_KEY: 'test-key',
            },
          },
        },
      } as any);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should handle OPTIONS request for CORS preflight', async () => {
      const { OPTIONS } = await import('../src/pages/rss/popular.xml.ts');
      const response = await OPTIONS({} as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    });
  });

  describe('RSS Structure', () => {
    it('should include required RSS channel elements', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: {
          runtime: {
            env: {
              SUPABASE_SERVICE_KEY: 'test-key',
            },
          },
        },
      } as any);

      const body = await response.text();
      expect(body).toContain('<channel>');
      expect(body).toContain('</channel>');
      expect(body).toContain('<title>GuildPost - Trending Minecraft Servers</title>');
      expect(body).toContain('<link>https://guildpost.tech/minecraft</link>');
      expect(body).toContain('<description>Top trending Minecraft servers ranked by votes');
      expect(body).toContain('<language>en-us</language>');
      expect(body).toContain('<image>');
      expect(body).toContain('<url>https://guildpost.tech/favicon.png</url>');
      expect(body).toContain('<atom:link href="https://guildpost.tech/rss/popular.xml"');
      expect(body).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    });

    it('should include edition icons in descriptions', async () => {
      const mockServers = [
        { id: 'java-server', name: 'Java', ip: 'j.example.com', port: 25565, tags: [], vote_count: 10, players_online: 0, max_players: 10, status: 'online', created_at: '2024-01-01T00:00:00Z', edition: 'java' },
        { id: 'bedrock-server', name: 'Bedrock', ip: 'b.example.com', port: 19132, tags: [], vote_count: 10, players_online: 0, max_players: 10, status: 'online', created_at: '2024-01-01T00:00:00Z', edition: 'bedrock' },
        { id: 'crossplay-server', name: 'Crossplay', ip: 'c.example.com', port: 25565, tags: [], vote_count: 10, players_online: 0, max_players: 10, status: 'online', created_at: '2024-01-01T00:00:00Z', edition: 'crossplay' },
        { id: 'both-server', name: 'Both', ip: 'both.example.com', port: 25565, tags: [], vote_count: 10, players_online: 0, max_players: 10, status: 'online', created_at: '2024-01-01T00:00:00Z', edition: 'both' },
      ];

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockServers,
      });

      const { GET } = await import('../src/pages/rss/popular.xml.ts');
      const response = await GET({
        url: new URL(`${SITE_URL}/rss/popular.xml`),
        locals: {
          runtime: {
            env: {
              SUPABASE_SERVICE_KEY: 'test-key',
            },
          },
        },
      } as any);

      const body = await response.text();
      expect(body).toContain('☕ java');
      expect(body).toContain('📱 bedrock');
      expect(body).toContain('🌐 crossplay');
      expect(body).toContain('🌐 both');
    });
  });
});
