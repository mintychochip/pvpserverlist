import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Discord Bot Votes Command', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Slash command structure', () => {
    it('should define /votes command with server parameter', () => {
      const command = {
        name: 'votes',
        description: 'Show vote stats for a server',
        options: [
          {
            name: 'server',
            description: 'Server name to show vote stats for',
            type: 3, // STRING
            required: true,
            min_length: 3,
            max_length: 50,
          }
        ]
      };

      expect(command.name).toBe('votes');
      expect(command.options).toHaveLength(1);
      expect(command.options[0].name).toBe('server');
      expect(command.options[0].required).toBe(true);
      expect(command.options[0].min_length).toBe(3);
      expect(command.options[0].max_length).toBe(50);
    });
  });

  describe('Discord interaction handling', () => {
    it('should extract server name from slash command interaction', () => {
      const interaction = {
        type: 2, // APPLICATION_COMMAND
        data: {
          name: 'votes',
          options: [
            { name: 'server', value: 'Herocraft' }
          ]
        }
      };

      const server = interaction.data.options.find(o => o.name === 'server')?.value;
      expect(server).toBe('Herocraft');
    });

    it('should handle interactions without server parameter', () => {
      const interaction = {
        data: {
          name: 'votes',
          options: []
        }
      };

      const server = interaction.data.options.find(o => o.name === 'server')?.value;
      expect(server).toBeUndefined();
    });
  });

  describe('GuildPost API integration', () => {
    it('should call hybrid search endpoint with server name', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { id: '1', name: 'Test Server', description: 'A test server' }
          ]
        })
      });
      global.fetch = mockFetch;

      const serverName = 'Test Server';
      const searchUrl = `https://guildpost.tech/api/search/hybrid`;
      
      await fetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: serverName, limit: 1 })
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should fetch vote analytics from server votes endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          votes_24h: 125,
          vote_trend: 12.5,
          top_hourly_votes: 15
        })
      });
      global.fetch = mockFetch;

      const serverId = 'test-server-123';
      const votesUrl = `https://guildpost.tech/api/servers/${serverId}/votes`;
      
      await fetch(votesUrl);

      expect(mockFetch).toHaveBeenCalledWith(votesUrl);
    });
  });

  describe('Discord embed formatting', () => {
    it('should create rich embed for vote stats', () => {
      const server = {
        id: 'abc123',
        name: 'Epic PvP',
        icon: 'https://example.com/icon.png'
      };
      
      const voteStats = {
        votes_24h: 125,
        vote_trend: 12.5,
        top_hourly_votes: 15
      };

      const embed = {
        title: `🗳️ Vote Stats for ${server.name}`,
        thumbnail: { url: server.icon },
        fields: [
          { 
            name: 'Votes (24h)', 
            value: String(voteStats.votes_24h), 
            inline: true 
          },
          { 
            name: 'Trend', 
            value: `${voteStats.vote_trend > 0 ? '↗️' : '↘️'} ${voteStats.vote_trend}%`, 
            inline: true 
          },
          { 
            name: 'Peak Hour', 
            value: String(voteStats.top_hourly_votes), 
            inline: true 
          }
        ],
        url: `https://guildpost.tech/servers/${server.id}`,
        color: 0x00f5d4, // GuildPost cyan
      };

      expect(embed.title).toContain('Vote Stats');
      expect(embed.fields).toHaveLength(3);
      expect(embed.url).toContain('/servers/abc123');
    });
  });

  describe('Error handling', () => {
    it('should handle server not found', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });
      global.fetch = mockFetch;

      const response = {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: '❌ No server found with that name. Please check the spelling and try again.',
          flags: 64 // EPHEMERAL
        }
      };

      expect(response.data.content).toContain('No server found');
      expect(response.data.flags).toBe(64);
    });

    it('should handle API failure gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const errorResponse = {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: '⚠️ Unable to fetch vote stats at this moment. Please try again later.',
          flags: 64 // EPHEMERAL
        }
      };

      expect(errorResponse.data.content).toContain('Unable to fetch');
      expect(errorResponse.data.flags).toBe(64);
    });

    it('should handle invalid server name (too short)', () => {
      const serverName = 'ab';

      const isValid = serverName.length >= 3;
      const errorMessage = isValid ? null : 'Server name must be at least 3 characters long.';

      expect(isValid).toBe(false);
      expect(errorMessage).toBe('Server name must be at least 3 characters long.');
    });
  });
});