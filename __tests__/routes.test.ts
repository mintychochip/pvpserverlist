import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Cloudflare Routes Configuration', () => {
  it('should have empty exclude since API routes use Astro SSR worker', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    // API routes are handled by Astro SSR worker, not Cloudflare Functions
    // So we don't need to exclude them from static file serving
    expect(routes.exclude).toEqual([]);
  });

  it('should have correct include pattern', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    expect(routes.include).toContain('/*');
    expect(routes.version).toBe(1);
  });
});
