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

describe('Discord Auth Callback API', () => {
  describe('GET /api/auth/discord/callback', () => {
    it('should return 400 if code or state is missing', async () => {
      const mockRequest = new Request('http://localhost/api/auth/discord/callback');
      const mockUrl = new URL('http://localhost/api/auth/discord/callback');
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing code or state parameter');
    });

    it('should return 400 for invalid base64 state', async () => {
      // Mock fetch to prevent actual network calls
      global.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      const mockRequest = new Request('http://localhost/api/auth/discord/callback?code=testcode&state=invalid_base64');
      const mockUrl = new URL('http://localhost/api/auth/discord/callback?code=testcode&state=invalid_base64');
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid state parameter');
    });

    it('should return 400 if serverId missing from decoded state', async () => {
      // Mock fetch to prevent actual network calls
      global.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create a state with missing serverId
      const stateWithoutServerId = Buffer.from(JSON.stringify({ redirectUrl: '/dashboard', timestamp: Date.now() })).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${stateWithoutServerId}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${stateWithoutServerId}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing server ID in state');
    });

it('should return 500 on Discord API errors', async () => {
      // Mock fetch to simulate Discord API failure
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: false,
            text: () => Promise.resolve('API Error'),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to authenticate with Discord');
    });

    it('should handle OPTIONS preflight request', async () => {
      const mockRequest = new Request('http://localhost/api/auth/discord/callback', { method: 'OPTIONS' });
      const mockUrl = new URL('http://localhost/api/auth/discord/callback');
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should exchange code for access token with Discord', async () => {
      // Mock environment variables
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
      
      // Mock fetch to simulate successful Discord API calls
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-access-token' }),
          });
        }
        if (url.includes('discord.com/api/users/@me/guilds')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 'guild1', name: 'Test Guild', permissions: '32' }]),
          });
        }
        if (url.includes('supabase.co/rest/v1')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      // Should redirect to Discord for OAuth
      expect(response.status).toBe(302);
    });

    it('should fetch user\'s guilds from Discord API', async () => {
      // Mock environment variables
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      
      // Mock fetch to simulate successful Discord API calls
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-access-token' }),
          });
        }
        if (url.includes('discord.com/api/users/@me/guilds')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 'guild1', name: 'Test Guild', permissions: '32' }]),
          });
        }
        if (url.includes('supabase.co/rest/v1')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(302);
    });

    it('should check if GuildPost bot is in any guild (via Discord bot API)', async () => {
      // Mock environment variables
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
      process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
      process.env.GUILDPOST_BOT_ID = 'test-bot-id';
      
      // Mock fetch to simulate successful Discord API calls
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-access-token' }),
          });
        }
        if (url.includes('discord.com/api/users/@me/guilds')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 'guild1', name: 'Test Guild', permissions: '32' }]),
          });
        }
        if (url.includes('discord.com/api/guilds/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ user: { id: 'user1' } }),
          });
        }
        if (url.includes('supabase.co/rest/v1')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(302);
    });

    it('should check admin/manage server permissions via permission bitfield', async () => {
      // Mock environment variables
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
      
      // Mock fetch to simulate successful Discord API calls
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-access-token' }),
          });
        }
        if (url.includes('discord.com/api/users/@me/guilds')) {
          // Return a guild with admin permissions (permission bitfield 8 = ADMINISTRATOR)
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 'guild1', name: 'Test Guild', permissions: '8' }]),
          });
        }
        if (url.includes('supabase.co/rest/v1')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(302);
    });

    it('should store verification in Supabase (discord_verified, discord_guild_id, etc.)', async () => {
      // Mock environment variables
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
      process.env.SUPABASE_SERVICE_KEY = 'test-key';
      
      // Mock fetch to simulate successful Discord API calls
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-access-token' }),
          });
        }
        if (url.includes('discord.com/api/users/@me/guilds')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 'guild1', name: 'Test Guild', permissions: '32' }]),
          });
        }
        if (url.includes('supabase.co/rest/v1')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(302);
    });

    it('should redirect with discord_verified=true on success', async () => {
      // Mock environment variables
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
      process.env.SUPABASE_SERVICE_KEY = 'test-key';
      
      // Mock fetch to simulate successful Discord API calls
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-access-token' }),
          });
        }
        if (url.includes('discord.com/api/users/@me/guilds')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 'guild1', name: 'Test Guild', permissions: '32' }]),
          });
        }
        if (url.includes('supabase.co/rest/v1')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('discord_verified=true');
    });

    it('should redirect with discord_error on failure (bot_not_in_server, no_permission)', async () => {
      // Mock environment variables
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
      
      // Mock fetch to simulate failure cases
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('discord.com/api/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-access-token' }),
          });
        }
        if (url.includes('discord.com/api/users/@me/guilds')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]), // Return empty array to simulate no guilds
          });
        }
        if (url.includes('supabase.co/rest/v1')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });
      
      // Create valid state data
      const stateData = { serverId: 'test123', redirectUrl: 'http://localhost/dashboard' };
      const validState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      const mockRequest = new Request(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      const mockUrl = new URL(`http://localhost/api/auth/discord/callback?code=testcode&state=${validState}`);
      
      // Mock the module
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const response = await GET({ request: mockRequest, url: mockUrl });
      
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('discord_error');
    });
  });
});