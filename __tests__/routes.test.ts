import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Cloudflare Routes Configuration', () => {
  it('should have empty exclude (Astro worker handles all routing)', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    // With Astro SSR via _worker.js, all routes are handled by the worker
    // No need for exclude patterns - the worker does its own routing
    expect(routes.exclude).toEqual([]);
  });

  it('should have correct include pattern and empty exclude', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    expect(routes.include).toContain('/*');
    expect(routes.version).toBe(1);
    expect(routes.exclude).toEqual([]);
  });
});
