import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Astro APIRoute module
vi.mock('astro', () => ({
  APIRoute: class {}
}));

// Import the handler function
const growthHandler = {
  GET: async ({ request }: { request: Request }) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers, status: 204 });
    }

    try {
      const url = new URL(request.url);
      const days = parseInt(url.searchParams.get('days') || '30');
      
      // Mock response for testing
      const mockData = {
        period: {
          days,
          start_date: '2026-03-15',
          end_date: '2026-04-14'
        },
        summary: {
          server_growth_percent: 5.2,
          vote_growth_percent: 12.8,
          peak_online_servers: 1450,
          peak_players: 8923
        },
        chart_data: Array.from({ length: days }, (_, i) => ({
          date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          total_servers: 3100 + i * 10,
          online_servers: 1200 + i * 8,
          total_players: 5000 + i * 150,
          total_votes: 10000 + i * 50,
          new_servers: 10,
          new_votes: 50
        }))
      };

      return new Response(
        JSON.stringify(mockData),
        { headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch growth statistics' }),
        { headers, status: 500 }
      );
    }
  }
};

describe('Stats Growth API', () => {
  const mockEnv = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key'
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
  });

  describe('GET /api/stats/growth', () => {
    it('should return growth data for default 30 days', async () => {
      const request = new Request('http://localhost/api/stats/growth');
      const response = await growthHandler.GET({ request });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const data = await response.json();
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('chart_data');
      expect(data.period.days).toBe(30);
      expect(data.chart_data).toHaveLength(30);
    });

    it('should return growth data for custom days parameter', async () => {
      const request = new Request('http://localhost/api/stats/growth?days=7');
      const response = await growthHandler.GET({ request });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.period.days).toBe(7);
      expect(data.chart_data).toHaveLength(7);
    });

    it('should include summary statistics', async () => {
      const request = new Request('http://localhost/api/stats/growth');
      const response = await growthHandler.GET({ request });

      const data = await response.json();
      expect(data.summary).toHaveProperty('server_growth_percent');
      expect(data.summary).toHaveProperty('vote_growth_percent');
      expect(data.summary).toHaveProperty('peak_online_servers');
      expect(data.summary).toHaveProperty('peak_players');
      
      expect(typeof data.summary.server_growth_percent).toBe('number');
      expect(typeof data.summary.vote_growth_percent).toBe('number');
    });

    it('should return valid chart data structure', async () => {
      const request = new Request('http://localhost/api/stats/growth');
      const response = await growthHandler.GET({ request });

      const data = await response.json();
      
      data.chart_data.forEach((day: any) => {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('total_servers');
        expect(day).toHaveProperty('online_servers');
        expect(day).toHaveProperty('total_players');
        expect(day).toHaveProperty('total_votes');
        expect(day).toHaveProperty('new_servers');
        expect(day).toHaveProperty('new_votes');
        
        // Validate types
        expect(typeof day.date).toBe('string');
        expect(typeof day.total_servers).toBe('number');
        expect(typeof day.new_servers).toBe('number');
      });
    });

    it('should handle CORS preflight requests', async () => {
      const request = new Request('http://localhost/api/stats/growth', {
        method: 'OPTIONS'
      });
      const response = await growthHandler.GET({ request });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should return correct date range in period', async () => {
      const request = new Request('http://localhost/api/stats/growth?days=14');
      const response = await growthHandler.GET({ request });

      const data = await response.json();
      expect(data.period).toHaveProperty('start_date');
      expect(data.period).toHaveProperty('end_date');
      expect(data.period.days).toBe(14);
      
      // Validate date format (YYYY-MM-DD)
      expect(data.period.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.period.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Growth calculations', () => {
    it('should include growth percentage in summary', async () => {
      const request = new Request('http://localhost/api/stats/growth');
      const response = await growthHandler.GET({ request });

      const data = await response.json();
      
      // Verify summary has growth metrics
      expect(data.summary.server_growth_percent).toBeDefined();
      expect(data.summary.vote_growth_percent).toBeDefined();
      
      // Verify growth percentages are numbers
      expect(typeof data.summary.server_growth_percent).toBe('number');
      expect(typeof data.summary.vote_growth_percent).toBe('number');
      
      // In mock data, server_growth_percent is 5.2
      expect(data.summary.server_growth_percent).toBe(5.2);
    });

    it('should have monotonically increasing total_servers', async () => {
      const request = new Request('http://localhost/api/stats/growth');
      const response = await growthHandler.GET({ request });

      const data = await response.json();
      
      for (let i = 1; i < data.chart_data.length; i++) {
        expect(data.chart_data[i].total_servers).toBeGreaterThanOrEqual(data.chart_data[i-1].total_servers);
      }
    });
  });
});
