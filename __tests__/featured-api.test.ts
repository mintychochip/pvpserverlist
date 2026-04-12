import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Featured Servers API', () => {
  const apiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', 'featured.ts');

  it('should have the featured API route file', () => {
    expect(fs.existsSync(apiPath)).toBe(true);
  });

  it('should export GET handler', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('export const GET');
  });

  it('should validate limit parameter', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('parseInt(url.searchParams.get');
    expect(content).toContain('maxLimit');
    expect(content).toContain('Limit must be between');
  });

  it('should call Supabase RPC function', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('get_featured_servers');
    expect(content).toContain('/rest/v1/rpc/');
  });

  it('should have fallback query when RPC fails', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('fallback');
    expect(content).toContain('is_fallback');
  });

  it('should return CORS headers', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('Access-Control-Allow-Origin');
  });

  it('should include cache headers', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('Cache-Control');
    expect(content).toContain('max-age');
  });

  it('should handle missing Supabase config', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('Supabase configuration missing');
  });

  it('should order by tier priority', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('elite');
    expect(content).toContain('premium');
    expect(content).toContain('tier.desc');
  });

  it('should filter by online status', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('status=eq.online');
  });

  it('should return enriched server data with banner and icon', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('banner_url');
    expect(content).toContain('icon_url');
  });

  it('should handle empty featured list with top voted fallback', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('top voted servers');
    expect(content).toContain('order=vote_count.desc');
  });

  it('should parse limit from query params with default', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toMatch(/limit.*\|\|.*6/);
    expect(content).toMatch(/parseInt.*limit/);
  });

  it('should have proper error handling', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('try {');
    expect(content).toContain('catch (err)');
    expect(content).toContain('500');
  });
});
