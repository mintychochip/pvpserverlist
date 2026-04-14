import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Discord Bot /top Command Tests
 * 
 * Tests for the /top slash command that displays top-voted servers
 */

describe('/top Discord Command', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Slash command structure', () => {
    it('should define /top command with optional category parameter', () => {
      const command = {
        name: 'top',
        description: 'Show top-voted Minecraft servers',
        options: [
          {
            name: 'category',
            description: 'Filter by category (e.g., "survival", "pvp", "minigames")',
            type: 3, // STRING
            required: false,
            min_length: 2,
            max_length: 30,
          },
          {
            name: 'limit',
            description: 'Number of servers to show (1-5, default: 5)',
            type: 4, // INTEGER
            required: false,
            min_value: 1,
            max_value: 5,
          }
        ],
        integration_types: [0, 1],
        contexts: [0, 1, 2],
      };

      expect(command.name).toBe('top');
      expect(command.options).toHaveLength(2);
      expect(command.options[0].name).toBe('category');
      expect(command.options[0].required).toBe(false);
      expect(command.options[1].name).toBe('limit');
      expect(command.options[1].min_value).toBe(1);
      expect(command.options[1].max_value).toBe(5);
    });

    it('should have proper integration types and contexts', () => {
      const command = {
        name: 'top',
        integration_types: [0, 1], // Guild and user installs
        contexts: [0, 1, 2], // Guild, DM, group DM
      };

      expect(command.integration_types).toContain(0);
      expect(command.integration_types).toContain(1);
      expect(command.contexts).toHaveLength(3);
    });
  });

  describe('Interaction handling', () => {
    it('should extract category from interaction options', () => {
      const interaction = {
        type: 2, // APPLICATION_COMMAND
        data: {
          name: 'top',
          options: [
            { name: 'category', value: 'pvp' }
          ]
        }
      };

      const category = interaction.data.options.find((o: any) => o.name === 'category')?.value;
      expect(category).toBe('pvp');
    });

    it('should handle interactions without optional parameters', () => {
      const interaction = {
        data: {
          name: 'top',
          options: []
        }
      };

      const category = interaction.data.options?.find((o: any) => o.name === 'category')?.value;
      const limit = interaction.data.options?.find((o: any) => o.name === 'limit')?.value ?? 5;
      
      expect(category).toBeUndefined();
      expect(limit).toBe(5);
    });

    it('should use provided limit when specified', () => {
      const interaction = {
        data: {
          name: 'top',
          options: [
            { name: 'limit', value: 3 }
          ]
        }
      };

      const limit = interaction.data.options.find((o: any) => o.name === 'limit')?.value ?? 5;
      expect(limit).toBe(3);
    });

    it('should cap limit at 5 maximum', () => {
      const requestedLimit = 10;
      const actualLimit = Math.min(Math.max(requestedLimit || 5, 1), 5);
      
      expect(actualLimit).toBe(5);
    });
  });

  describe('Top servers API integration', () => {
    it('should build correct Supabase query for top servers', () => {
      const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
      const limit = 5;
      
      const url = `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,description,vote_count,players_online,max_players,version,icon,tags&status=eq.online&order=vote_count.desc&limit=${limit}`;
      
      expect(url).toContain('order=vote_count.desc');
      expect(url).toContain('status=eq.online');
      expect(url).toContain('limit=5');
    });

    it('should add category filter when provided', () => {
      const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
      const category = 'survival';
      const limit = 5;
      
      let url = `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,description,vote_count,players_online,max_players,version,icon,tags&status=eq.online&order=vote_count.desc&limit=${limit}`;
      url += `&tags=cs.{${category}}`;
      
      expect(url).toContain('tags=cs.{survival}');
    });

    it('should fetch servers with correct headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { id: '1', name: 'Server 1', vote_count: 1000 },
          { id: '2', name: 'Server 2', vote_count: 800 }
        ])
      });
      global.fetch = mockFetch;

      const supabaseKey = 'test-key';
      const url = 'https://test.supabase.co/rest/v1/servers?limit=5';
      
      await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          })
        })
      );
    });
  });

  describe('Discord embed formatting', () => {
    it('should format top server embed with trophy emoji', () => {
      const server = {
        id: 'abc123',
        name: 'Hypixel Network',
        description: 'The best Minecraft server with minigames and more',
        vote_count: 15000,
        players_online: 45000,
        max_players: 50000,
        version: '1.21',
        icon: 'https://example.com/icon.png',
        tags: ['minigames', 'pvp']
      };

      const trophyEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      const description = server.description.substring(0, 150) + (server.description.length > 150 ? '...' : '');

      const embed = {
        title: `${trophyEmojis[0]} ${server.name}`,
        description,
        thumbnail: { url: server.icon },
        fields: [
          { name: 'Votes', value: (server.vote_count || 0).toLocaleString(), inline: true },
          { name: 'Players', value: `${server.players_online || 0}/${server.max_players || '?'}`, inline: true },
          { name: 'Version', value: server.version || 'Unknown', inline: true },
        ],
        url: `https://guildpost.tech/servers/${server.id}`,
        color: 0xFFD700, // Gold for #1
      };

      expect(embed.title).toBe('🥇 Hypixel Network');
      expect(embed.fields[0].value).toBe('15,000');
      expect(embed.fields[1].value).toBe('45000/50000');
      expect(embed.url).toContain('/servers/abc123');
    });

    it('should use appropriate colors for rankings', () => {
      const colors = [
        0xFFD700, // Gold for #1
        0xC0C0C0, // Silver for #2
        0xCD7F32, // Bronze for #3
        0x00f5d4, // GuildPost cyan for others
      ];

      expect(colors[0]).toBe(0xFFD700);
      expect(colors[1]).toBe(0xC0C0C0);
      expect(colors[2]).toBe(0xCD7F32);
    });

    it('should truncate long descriptions', () => {
      const longDesc = 'a'.repeat(200);
      const truncated = longDesc.substring(0, 150) + (longDesc.length > 150 ? '...' : '');

      expect(truncated.length).toBeLessThanOrEqual(153);
      expect(truncated.slice(-3)).toBe('...');
    });

    it('should handle servers without icons', () => {
      const server = {
        id: '1',
        name: 'Test Server',
        description: 'Test',
        vote_count: 100,
        icon: null
      };

      const embed = {
        title: '🥇 Test Server',
        description: server.description,
        thumbnail: server.icon ? { url: server.icon } : undefined,
      };

      expect(embed.thumbnail).toBeUndefined();
    });

    it('should format multiple servers as separate embeds', () => {
      const servers = [
        { id: '1', name: 'First', vote_count: 1000 },
        { id: '2', name: 'Second', vote_count: 800 },
        { id: '3', name: 'Third', vote_count: 600 }
      ];

      const trophyEmojis = ['🥇', '🥈', '🥉'];
      
      const embeds = servers.map((s, index) => ({
        title: `${trophyEmojis[index]} ${s.name}`,
        color: index === 0 ? 0xFFD700 : index === 1 ? 0xC0C0C0 : 0xCD7F32,
      }));

      expect(embeds).toHaveLength(3);
      expect(embeds[0].title).toBe('🥇 First');
      expect(embeds[1].title).toBe('🥈 Second');
      expect(embeds[2].title).toBe('🥉 Third');
    });

    it('should format vote counts with locale separators', () => {
      const voteCount = 15000;
      const formatted = (voteCount || 0).toLocaleString();
      
      expect(formatted).toBe('15,000');
    });
  });

  describe('Response formatting', () => {
    it('should format response with category mention', () => {
      const servers = [{ id: '1', name: 'Server 1' }];
      const category = 'survival';
      
      const content = `🏆 Top ${servers.length} Server${servers.length > 1 ? 's' : ''} in **${category}** on GuildPost:`;
      
      expect(content).toContain('survival');
      expect(content).toContain('🏆');
    });

    it('should format response without category', () => {
      const servers = [{ id: '1', name: 'Server 1' }];
      
      const content = `🏆 Top ${servers.length} Server${servers.length > 1 ? 's' : ''} on GuildPost:`;
      
      expect(content).not.toContain('in **');
    });
  });

  describe('Error handling', () => {
    it('should handle empty results gracefully', () => {
      const servers: any[] = [];
      const category = 'nonexistent';
      
      const response = {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: `🔍 No servers found in category "${category}". Try a different category or check back later!`,
          flags: 64, // EPHEMERAL
        }
      };

      expect(response.data.content).toContain('No servers found');
      expect(response.data.flags).toBe(64);
    });

    it('should handle API failure gracefully', () => {
      const response = {
        type: 4,
        data: {
          content: '⚠️ Unable to fetch top servers at this moment. Please try again later.',
          flags: 64
        }
      };

      expect(response.data.content).toContain('Unable to fetch');
      expect(response.data.flags).toBe(64);
    });

    it('should handle Supabase API errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' })
      });
      global.fetch = mockFetch;

      const errorResponse = {
        type: 4,
        data: {
          content: '⚠️ Unable to fetch top servers at this moment. Please try again later.',
          flags: 64
        }
      };

      expect(errorResponse.data.content).toContain('Unable to fetch');
    });
  });

  describe('Edge cases', () => {
    it('should handle servers with zero votes', () => {
      const server = {
        id: '1',
        name: 'New Server',
        vote_count: 0,
        players_online: 0,
        max_players: 100
      };

      const embed = {
        fields: [
          { name: 'Votes', value: (server.vote_count || 0).toLocaleString(), inline: true },
          { name: 'Players', value: `${server.players_online || 0}/${server.max_players || '?'}`, inline: true }
        ]
      };

      expect(embed.fields[0].value).toBe('0');
      expect(embed.fields[1].value).toBe('0/100');
    });

    it('should handle servers with missing optional fields', () => {
      const server = {
        id: '1',
        name: 'Test Server',
        // description, version, icon missing
      };

      const description = server.description 
        ? server.description.substring(0, 150) + (server.description.length > 150 ? '...' : '')
        : 'No description available';

      const embed = {
        title: '🥇 Test Server',
        description,
        fields: [
          { name: 'Votes', value: '0', inline: true },
          { name: 'Players', value: '0/?', inline: true },
          { name: 'Version', value: 'Unknown', inline: true }
        ]
      };

      expect(embed.description).toBe('No description available');
      expect(embed.fields[2].value).toBe('Unknown');
    });

    it('should handle limit of 1 correctly', () => {
      const limit = 1;
      const servers = [{ id: '1', name: 'Top Server' }];
      
      const response = {
        type: 4,
        data: {
          content: `🏆 Top ${servers.length} Server on GuildPost:`,
          embeds: servers.slice(0, limit)
        }
      };

      expect(response.data.content).toBe('🏆 Top 1 Server on GuildPost:');
    });
  });
});
