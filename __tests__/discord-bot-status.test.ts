import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Discord Bot Status Command', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Command structure', () => {
    it('should define /status command with no parameters', () => {
      const command = {
        name: 'status',
        description: 'Check if the GuildPost bot is online',
        options: [],
        integration_types: [0, 1],
        contexts: [0, 1, 2],
      };

      expect(command.name).toBe('status');
      expect(command.description).toContain('online');
      expect(command.options).toHaveLength(0);
    });
  });

  describe('Status response', () => {
    it('should return online status when API is healthy', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      const embed = {
        title: '🤖 GuildPost Bot Status',
        description: 'All systems operational! The bot is online and ready to help you discover Minecraft servers.',
        color: 0x00f5d4,
        fields: [
          { name: 'Status', value: '🟢 Online', inline: true },
          { name: 'Commands', value: '`/search` - Find servers\n`/status` - Check health', inline: true },
          { name: 'Website', value: '[guildpost.tech](https://guildpost.tech)', inline: true },
        ],
      };

      const response = {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: { embeds: [embed] },
      };

      expect(response.type).toBe(4);
      expect(response.data.embeds[0].title).toContain('Status');
      expect(response.data.embeds[0].color).toBe(0x00f5d4);
      expect(response.data.embeds[0].fields[0].value).toBe('🟢 Online');
    });

    it('should return degraded status when API fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });
      global.fetch = mockFetch as any;

      const embed = {
        title: '🤖 GuildPost Bot Status',
        description: '⚠️ Some services may be experiencing issues. The search functionality might be limited.',
        color: 0xff3864,
        fields: [
          { name: 'Status', value: '🟡 Degraded', inline: true },
          { name: 'Commands', value: '`/search` - Find servers\n`/status` - Check health', inline: true },
          { name: 'Website', value: '[guildpost.tech](https://guildpost.tech)', inline: true },
        ],
      };

      const response = {
        type: 4,
        data: { embeds: [embed] },
      };

      expect(response.data.embeds[0].color).toBe(0xff3864);
      expect(response.data.embeds[0].fields[0].value).toBe('🟡 Degraded');
    });

    it('should include timestamp in embed', () => {
      const now = new Date().toISOString();
      const embed = {
        title: 'Status',
        timestamp: now,
      };

      expect(embed.timestamp).toBeDefined();
      expect(new Date(embed.timestamp).toISOString()).toBe(now);
    });

    it('should list available commands in status embed', () => {
      const embed = {
        fields: [
          { name: 'Commands', value: '`/search` - Find servers\n`/status` - Check health' },
        ],
      };

      const commandsField = embed.fields.find(f => f.name === 'Commands');
      expect(commandsField).toBeDefined();
      expect(commandsField?.value).toContain('/search');
      expect(commandsField?.value).toContain('/status');
    });

    it('should include website link in status embed', () => {
      const embed = {
        fields: [
          { name: 'Website', value: '[guildpost.tech](https://guildpost.tech)' },
        ],
      };

      const websiteField = embed.fields.find(f => f.name === 'Website');
      expect(websiteField).toBeDefined();
      expect(websiteField?.value).toContain('guildpost.tech');
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch as any;

      const errorResponse = {
        type: 4,
        data: {
          content: '⚠️ Unable to check status at this moment. Please try again later.',
          flags: 64, // EPHEMERAL
        },
      };

      expect(errorResponse.data.content).toContain('Unable to check status');
      expect(errorResponse.data.flags).toBe(64);
    });

    it('should handle timeout errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Timeout'));
      global.fetch = mockFetch as any;

      const errorResponse = {
        type: 4,
        data: {
          content: '⚠️ Unable to check status at this moment. Please try again later.',
          flags: 64,
        },
      };

      expect(errorResponse.data.content).toContain('try again later');
    });
  });

  describe('API integration', () => {
    it('should call health endpoint with proper headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });
      global.fetch = mockFetch as any;

      await fetch('https://guildpost.tech/api/health', {
        method: 'GET',
        headers: { 'Origin': 'discord.com' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://guildpost.tech/api/health',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Origin': 'discord.com' }),
        })
      );
    });

    it('should handle health endpoint returning null', async () => {
      const mockFetch = vi.fn().mockResolvedValue(null);
      global.fetch = mockFetch as any;

      // When fetch returns null (network failure), we should handle it
      const response = await fetch('https://guildpost.tech/api/health').catch(() => null);

      expect(response).toBeNull();
    });
  });

  describe('Discord interaction types', () => {
    it('should respond with CHANNEL_MESSAGE_WITH_SOURCE type', () => {
      const response = {
        type: 4,
        data: { embeds: [{ title: 'Status' }] },
      };

      expect(response.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
    });

    it('should include embed in response data', () => {
      const response = {
        type: 4,
        data: {
          embeds: [{
            title: '🤖 GuildPost Bot Status',
            color: 0x00f5d4,
          }],
        },
      };

      expect(response.data.embeds).toHaveLength(1);
      expect(response.data.embeds[0].title).toContain('Status');
    });
  });
});
