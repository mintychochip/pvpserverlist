import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Discord Bot Invite API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET /api/discord/bot-invite', () => {
    it('should generate Discord bot invite URL with correct permissions', async () => {
      process.env.DISCORD_CLIENT_ID = '123456789';

      const module = await import('../src/pages/api/discord/bot-invite.ts');
      const response = await module.GET({
        request: { method: 'GET' },
        url: new URL('http://localhost/api/discord/bot-invite'),
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.inviteUrl).toContain('discord.com/oauth2/authorize');
      expect(data.inviteUrl).toContain('client_id=123456789');
      expect(data.inviteUrl).toContain('scope=bot');
      expect(data.inviteUrl).toContain('permissions=84992');
      expect(data.permissions.viewChannels).toBe(true);
      expect(data.permissions.sendMessages).toBe(true);
      expect(data.permissions.readHistory).toBe(true);
      expect(data.permissions.embedLinks).toBe(true);
    });

    it('should return error when Discord client ID is not configured', async () => {
      delete process.env.DISCORD_CLIENT_ID;

      const module = await import('../src/pages/api/discord/bot-invite.ts');
      const response = await module.GET({
        request: { method: 'GET' },
        url: new URL('http://localhost/api/discord/bot-invite'),
      } as any);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Discord bot not configured');
    });

    it('should include correct permission bits in URL', async () => {
      process.env.DISCORD_CLIENT_ID = '987654321';

      const module = await import('../src/pages/api/discord/bot-invite.ts');
      const response = await module.GET({
        request: { method: 'GET' },
        url: new URL('http://localhost/api/discord/bot-invite'),
      } as any);

      const data = await response.json();
      // 1024 (View Channels) + 65536 (Read Message History) + 2048 (Send Messages) + 16384 (Embed Links) = 84992
      expect(data.inviteUrl).toContain('permissions=84992');
    });

    it('should return CORS headers', async () => {
      process.env.DISCORD_CLIENT_ID = '123456789';

      const module = await import('../src/pages/api/discord/bot-invite.ts');
      const response = await module.GET({
        request: { method: 'GET' },
        url: new URL('http://localhost/api/discord/bot-invite'),
      } as any);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });
  });

  describe('OPTIONS /api/discord/bot-invite', () => {
    it('should handle OPTIONS request for CORS preflight', async () => {
      const module = await import('../src/pages/api/discord/bot-invite.ts');
      const response = await module.GET({
        request: { method: 'OPTIONS' },
        url: new URL('http://localhost/api/discord/bot-invite'),
      } as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
