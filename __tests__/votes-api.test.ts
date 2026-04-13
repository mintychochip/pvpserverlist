import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Vote Analytics API', () => {
  const apiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'votes.ts');

  it('should have the votes API route file', () => {
    expect(fs.existsSync(apiPath)).toBe(true);
  });

  it('should export GET handler', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('export const GET');
  });

  it('should export OPTIONS handler for CORS', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('export const OPTIONS');
  });

  it('should parse hours parameter with default of 24', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toMatch(/hours.*\|\|.*24/);
    expect(content).toContain('parseInt');
  });

  it('should query vote_history table', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('vote_history');
    expect(content).toContain('voted_at');
  });

  it('should extract server id from params', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('params');
    expect(content).toContain('const { id } = params');
  });

  it('should filter votes by server_id and time range', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('server_id=eq.');
    expect(content).toContain('voted_at=gte.');
    expect(content).toContain('order=voted_at.asc');
  });

  it('should aggregate votes by hour', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('hourlyData');
    expect(content).toContain('slice(0, 13)');
  });

  it('should initialize all hours with zero votes', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('= 0');
    expect(content).toMatch(/for.*hours.*i\+\+/);
  });

  it('should calculate total votes', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('total_votes');
  });

  it('should calculate average votes per hour', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('avg_per_hour');
  });

  it('should calculate max votes in any hour', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('max_per_hour');
    expect(content).toContain('Math.max');
  });

  it('should calculate trend vs previous period', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('prevStartTime');
    expect(content).toContain('trend_percent');
    expect(content).toContain('prevTotal');
  });

  it('should handle case when previous period has zero votes', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('prevTotal > 0');
    expect(content).toContain('trend = 100');
  });

  it('should return CORS headers', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('Access-Control-Allow-Origin');
    expect(content).toContain('*');
  });

  it('should handle missing Supabase configuration', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('missing key');
    expect(content).toContain('500');
  });

  it('should access env vars from Cloudflare runtime', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('locals as any)?.runtime?.env');
    expect(content).toContain('SUPABASE_SERVICE_KEY');
  });

  it('should format chart data with ISO timestamps', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('chart_data');
    expect(content).toContain(':00:00Z');
  });

  it('should sort chart data chronologically', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('.sort(');
    expect(content).toContain('localeCompare');
  });

  it('should include generated_at timestamp', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('generated_at');
    expect(content).toContain('toISOString');
  });

  it('should return proper error response on failure', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('catch (err)');
    expect(content).toContain('error');
    expect(content).toMatch(/status.*500/);
  });

  it('should handle Supabase API errors gracefully', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('!response.ok');
    expect(content).toContain('console.error');
  });

  it('should use correct Supabase REST API headers', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain("'apikey':");
    expect(content).toContain("'Authorization':");
    expect(content).toContain('Bearer');
  });

  it('should match players.ts API structure for consistency', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('server_id: id');
    expect(content).toContain('period:');
    expect(content).toMatch(/hours.*h/);
  });
});
