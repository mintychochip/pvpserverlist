import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Cloudflare Routes Configuration', () => {
  it('should have Astro SSR handle API routes (no exclude needed)', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    // With Astro SSR via _worker.js, API routes are handled by the worker
    // No need to exclude them - the worker routes them automatically
    const hasApiExclude = routes.exclude?.some((pattern: string) => 
      pattern === '/api/**' || pattern.startsWith('/api/')
    );
    
    // We intentionally removed /api/** exclusion to let Astro handle API routes
    expect(hasApiExclude).toBeFalsy();
  });

  it('should have correct include pattern', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    expect(routes.include).toContain('/*');
    expect(routes.version).toBe(1);
  });
});
