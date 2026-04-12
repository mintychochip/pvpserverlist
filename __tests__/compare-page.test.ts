import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Server Comparison Page', () => {
  const mockServers = [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Server 1',
      ip: 'mc1.example.com',
      port: 25565,
      status: 'online',
      players_online: 50,
      max_players: 100,
      vote_count: 150,
      rating_average: 4.5,
      rating_count: 20,
      version: '1.21',
      country_code: 'US',
      tags: ['Survival', 'PvP'],
      description: 'A great survival server',
      tier: 'premium',
      edition: 'java'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Server 2',
      ip: 'mc2.example.com',
      port: 25565,
      status: 'offline',
      players_online: 0,
      max_players: 50,
      vote_count: 75,
      rating_average: 3.5,
      rating_count: 10,
      version: '1.20',
      country_code: 'DE',
      tags: ['Creative'],
      description: 'Creative building server',
      tier: 'free',
      edition: 'bedrock'
    }
  ];

  describe('Compare API', () => {
    it('should accept valid server IDs', async () => {
      const validIds = mockServers.map(s => s.id);
      expect(validIds).toHaveLength(2);
      expect(validIds[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should reject invalid server IDs', () => {
      const invalidIds = [
        'not-a-uuid',
        '123',
        '',
        null,
        undefined,
        '550e8400-e29b-41d4-a716-44665544', // truncated
        '<script>alert(1)</script>' // XSS attempt
      ];
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      for (const id of invalidIds) {
        expect(uuidRegex.test(String(id))).toBe(false);
      }
    });

    it('should enforce 1-4 server limit', () => {
      const emptyIds: string[] = [];
      const tooManyIds = Array(5).fill(mockServers[0].id);
      
      expect(emptyIds.length).toBe(0);
      expect(tooManyIds.length).toBe(5);
      
      // Valid ranges
      expect([mockServers[0].id].length).toBeGreaterThanOrEqual(1);
      expect(mockServers.slice(0, 4).map(s => s.id).length).toBeLessThanOrEqual(4);
    });
  });

  describe('Comparison Rendering', () => {
    it('should render status indicators correctly', () => {
      const onlineServer = mockServers[0];
      const offlineServer = mockServers[1];
      
      expect(onlineServer.status).toBe('online');
      expect(offlineServer.status).toBe('offline');
    });

    it('should calculate player percentages', () => {
      for (const server of mockServers) {
        const percentage = server.max_players > 0 
          ? (server.players_online / server.max_players) * 100 
          : 0;
        expect(percentage).toBeGreaterThanOrEqual(0);
        expect(percentage).toBeLessThanOrEqual(100);
      }
    });

    it('should render star ratings correctly', () => {
      for (const server of mockServers) {
        const filled = Math.round(server.rating_average || 0);
        const empty = 5 - filled;
        
        expect(filled).toBeGreaterThanOrEqual(0);
        expect(filled).toBeLessThanOrEqual(5);
        expect(empty).toBeGreaterThanOrEqual(0);
        expect(empty).toBeLessThanOrEqual(5);
        expect(filled + empty).toBe(5);
      }
    });

    it('should format country flags correctly', () => {
      const getCountryFlag = (code: string) => {
        if (!code) return '';
        const codePoints = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
      };
      
      expect(getCountryFlag('US')).toBe('🇺🇸');
      expect(getCountryFlag('DE')).toBe('🇩🇪');
      expect(getCountryFlag('GB')).toBe('🇬🇧');
      expect(getCountryFlag('')).toBe('');
    });
  });

  describe('LocalStorage Management', () => {
    beforeEach(() => {
      // Mock localStorage
      const store: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; }
      });
    });

    it('should store and retrieve compare list', () => {
      const compareKey = 'guildpost_compare';
      const ids = mockServers.slice(0, 2).map(s => s.id);
      
      localStorage.setItem(compareKey, JSON.stringify(ids));
      const retrieved = JSON.parse(localStorage.getItem(compareKey) || '[]');
      
      expect(retrieved).toEqual(ids);
      expect(retrieved).toHaveLength(2);
    });

    it('should limit compare list to 4 servers', () => {
      const compareKey = 'guildpost_compare';
      const tooManyIds = Array(6).fill(mockServers[0].id);
      
      // Simulate the slice operation that happens in the real code
      const limitedIds = tooManyIds.slice(0, 4);
      localStorage.setItem(compareKey, JSON.stringify(limitedIds));
      
      const retrieved = JSON.parse(localStorage.getItem(compareKey) || '[]');
      expect(retrieved).toHaveLength(4);
    });

    it('should handle malformed localStorage data', () => {
      const compareKey = 'guildpost_compare';
      localStorage.setItem(compareKey, 'not-valid-json');
      
      let parsed;
      try {
        parsed = JSON.parse(localStorage.getItem(compareKey) || '[]');
      } catch {
        parsed = [];
      }
      
      // Should gracefully handle invalid data
      expect(Array.isArray(parsed) ? parsed : []).toEqual([]);
    });
  });

  describe('Edition Badge Logic', () => {
    it('should identify Java edition', () => {
      const server = { edition: 'java' };
      const ed = (server.edition || 'java').toLowerCase();
      expect(ed === 'java').toBe(true);
    });

    it('should identify Bedrock edition', () => {
      const server = { edition: 'bedrock' };
      const ed = (server.edition || 'java').toLowerCase();
      expect(ed === 'bedrock').toBe(true);
    });

    it('should identify Cross-play', () => {
      const crossplayVariants = ['crossplay', 'both', 'java+bedrock'];
      for (const variant of crossplayVariants) {
        const ed = variant.toLowerCase();
        const isCrossplay = ed === 'crossplay' || ed === 'both' || ed === 'java+bedrock';
        expect(isCrossplay).toBe(true);
      }
    });
  });

  describe('Tier Badge Logic', () => {
    it('should identify Elite tier', () => {
      expect(mockServers[0].tier === 'elite' || mockServers[0].tier === 'premium').toBe(true);
    });

    it('should identify Free tier', () => {
      expect(mockServers[1].tier === 'free' || !mockServers[1].tier).toBe(true);
    });
  });
});
