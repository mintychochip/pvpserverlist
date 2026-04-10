import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Cloudflare Routes Configuration', () => {
  it('should exclude /api/** for Functions routing', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    // API routes SHOULD be excluded so Cloudflare Functions handle them
    const hasApiExclude = routes.exclude?.some((pattern: string) => 
      pattern === '/api/**' || pattern.startsWith('/api/')
    );
    
    expect(hasApiExclude).toBe(true);
  });

  it('should have correct include pattern', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    expect(routes.include).toContain('/*');
    expect(routes.version).toBe(1);
  });
});
