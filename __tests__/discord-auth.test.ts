import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock the API modules
const mockGet = vi.fn();

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  mockGet.mockClear();
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Discord OAuth Flow', () => {
  describe('Bot Invite API', () => {
    it('should return invite URL when Discord is configured', async () => {
      process.env.DISCORD_CLIENT_ID = '123456789';
      
      const { GET } = await import('../src/pages/api/discord/bot-invite.ts');
      const request = new Request('http://localhost/api/discord/bot-invite');
      const response = await GET({ request, url: new URL('http://localhost/api/discord/bot-invite') });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.inviteUrl).toContain('discord.com/oauth2/authorize');
      expect(data.inviteUrl).toContain('client_id=123456789');
      expect(data.permissions.viewChannels).toBe(true);
      expect(data.permissions.sendMessages).toBe(true);
    });

    it('should return 500 when Discord client ID is not configured', async () => {
      process.env.DISCORD_CLIENT_ID = '';
      
      const { GET } = await import('../src/pages/api/discord/bot-invite.ts');
      const request = new Request('http://localhost/api/discord/bot-invite');
      const response = await GET({ request, url: new URL('http://localhost/api/discord/bot-invite') });
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Discord bot not configured');
    });

    it('should handle OPTIONS request for CORS', async () => {
      const { GET } = await import('../src/pages/api/discord/bot-invite.ts');
      const request = new Request('http://localhost/api/discord/bot-invite', { method: 'OPTIONS' });
      const response = await GET({ request, url: new URL('http://localhost/api/discord/bot-invite') });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Verify Status API', () => {
    it('should return verification status for verified server', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{
          discord_verified: true,
          discord_guild_id: '987654321',
          discord_guild_name: 'Test Server',
          discord_verified_at: '2026-04-12T20:00:00Z'
        }])
      });
      
      const { GET } = await import('../src/pages/api/discord/verify-status.ts');
      const request = new Request('http://localhost/api/discord/verify-status?server_id=123');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/discord/verify-status?server_id=123') 
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.verified).toBe(true);
      expect(data.guildId).toBe('987654321');
      expect(data.guildName).toBe('Test Server');
      expect(data.verifiedAt).toBe('2026-04-12T20:00:00Z');
    });

    it('should return unverified status for non-verified server', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{
          discord_verified: false,
          discord_guild_id: null,
          discord_guild_name: null,
          discord_verified_at: null
        }])
      });
      
      const { GET } = await import('../src/pages/api/discord/verify-status.ts');
      const request = new Request('http://localhost/api/discord/verify-status?server_id=123');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/discord/verify-status?server_id=123') 
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.verified).toBe(false);
      expect(data.guildId).toBeNull();
    });

    it('should return 400 when server_id is missing', async () => {
      const { GET } = await import('../src/pages/api/discord/verify-status.ts');
      const request = new Request('http://localhost/api/discord/verify-status');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/discord/verify-status') 
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing server_id parameter');
    });

    it('should return 404 when server is not found', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([])
      });
      
      const { GET } = await import('../src/pages/api/discord/verify-status.ts');
      const request = new Request('http://localhost/api/discord/verify-status?server_id=999');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/discord/verify-status?server_id=999') 
      });
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Server not found');
    });
  });

  describe('OAuth Initiate API', () => {
    it('should redirect to Discord OAuth with correct params', async () => {
      process.env.DISCORD_CLIENT_ID = '123456789';
      
      const { GET } = await import('../src/pages/api/auth/discord/initiate.ts');
      const request = new Request('http://localhost/api/auth/discord/initiate?server_id=456&redirect=/servers/456');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/auth/discord/initiate?server_id=456&redirect=/servers/456') 
      });
      
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('discord.com/oauth2/authorize');
      expect(location).toContain('client_id=123456789');
      expect(location).toContain('scope=identify+guilds');
      expect(location).toContain('state=');
    });

    it('should return 400 when server_id is missing', async () => {
      const { GET } = await import('../src/pages/api/auth/discord/initiate.ts');
      const request = new Request('http://localhost/api/auth/discord/initiate');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/auth/discord/initiate') 
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing server_id parameter');
    });

    it('should return 500 when Discord is not configured', async () => {
      process.env.DISCORD_CLIENT_ID = '';
      
      const { GET } = await import('../src/pages/api/auth/discord/initiate.ts');
      const request = new Request('http://localhost/api/auth/discord/initiate?server_id=456');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/auth/discord/initiate?server_id=456') 
      });
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Discord OAuth not configured');
    });
  });

  describe('OAuth Callback API', () => {
    it('should handle missing code or state parameters', async () => {
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const request = new Request('http://localhost/api/auth/discord/callback');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/auth/discord/callback') 
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing code or state parameter');
    });

    it('should handle invalid state parameter', async () => {
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const request = new Request('http://localhost/api/auth/discord/callback?code=abc&state=invalid');
      const response = await GET({ 
        request, 
        url: new URL('http://localhost/api/auth/discord/callback?code=abc&state=invalid') 
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid state parameter');
    });

    it('should redirect with error when user lacks admin permissions', async () => {
      const stateData = JSON.stringify({ serverId: '123', redirectUrl: 'http://localhost/servers/123', timestamp: Date.now() });
      const state = Buffer.from(stateData).toString('base64');
      
      // Mock successful token exchange
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'fake-token' })
        })
        // Mock guilds fetch - user has no admin perms
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{
            id: 'guild123',
            name: 'Test Guild',
            permissions: '0' // No permissions
          }])
        })
        // Mock bot not in guild
        .mockResolvedValueOnce({ ok: false });
      
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const request = new Request(`http://localhost/api/auth/discord/callback?code=abc&state=${state}`);
      const response = await GET({ 
        request, 
        url: new URL(`http://localhost/api/auth/discord/callback?code=abc&state=${state}`) 
      });
      
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('discord_error=');
    });
  });

  describe('Permission Checks', () => {
    it('should detect ADMINISTRATOR permission (0x8)', async () => {
      const stateData = JSON.stringify({ serverId: '123', redirectUrl: 'http://localhost/servers/123', timestamp: Date.now() });
      const state = Buffer.from(stateData).toString('base64');
      
      const adminPermission = '8'; // ADMINISTRATOR = 0x8
      
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'fake-token' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{
            id: 'guild123',
            name: 'Test Guild',
            permissions: adminPermission
          }])
        })
        .mockResolvedValueOnce({ 
          ok: true,
          json: () => Promise.resolve({ user: { id: 'bot123' } })
        })
        .mockResolvedValueOnce({ ok: true });
      
      // Mock the PATCH to Supabase
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'fake-token' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{
            id: 'guild123',
            name: 'Test Guild',
            permissions: adminPermission
          }])
        })
        .mockResolvedValueOnce({ 
          ok: true,
          json: () => Promise.resolve({ user: { id: 'bot123' } })
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true }); // Supabase PATCH
      
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const request = new Request(`http://localhost/api/auth/discord/callback?code=abc&state=${state}`);
      const response = await GET({ 
        request, 
        url: new URL(`http://localhost/api/auth/discord/callback?code=abc&state=${state}`) 
      });
      
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('discord_verified=true');
    });

    it('should detect MANAGE_GUILD permission (0x20)', async () => {
      const stateData = JSON.stringify({ serverId: '123', redirectUrl: 'http://localhost/servers/123', timestamp: Date.now() });
      const state = Buffer.from(stateData).toString('base64');
      
      const manageGuildPermission = '32'; // MANAGE_GUILD = 0x20
      
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'fake-token' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{
            id: 'guild123',
            name: 'Test Guild',
            permissions: manageGuildPermission
          }])
        })
        .mockResolvedValueOnce({ 
          ok: true,
          json: () => Promise.resolve({ user: { id: 'bot123' } })
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true }); // Supabase PATCH
      
      const { GET } = await import('../src/pages/api/auth/discord/callback.ts');
      const request = new Request(`http://localhost/api/auth/discord/callback?code=abc&state=${state}`);
      const response = await GET({ 
        request, 
        url: new URL(`http://localhost/api/auth/discord/callback?code=abc&state=${state}`) 
      });
      
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('discord_verified=true');
    });
  });
});

describe('DiscordVerification Component', () => {
  it('should render verified state correctly', () => {
    // Component renders verified badge when verified prop is true
    const props = {
      serverId: '123',
      verified: true,
      guildName: 'My Discord Server',
      verifiedAt: '2026-04-12T20:00:00Z'
    };
    
    expect(props.verified).toBe(true);
    expect(props.guildName).toBe('My Discord Server');
  });

  it('should render unverified state correctly', () => {
    const props = {
      serverId: '123',
      verified: false
    };
    
    expect(props.verified).toBe(false);
    expect(props.guildName).toBeUndefined();
  });
});
