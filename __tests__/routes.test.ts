import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Cloudflare Routes Configuration', () => {
  it('should not exclude /api/** from routes', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    // API routes should NOT be in the exclude list
    const hasApiExclude = routes.exclude?.some((pattern: string) => 
      pattern === '/api/**' || pattern.startsWith('/api/')
    );
    
    expect(hasApiExclude).toBe(false);
  });

  it('should have correct include pattern', () => {
    const routesPath = path.join(process.cwd(), 'public', '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    
    expect(routes.include).toContain('/*');
    expect(routes.version).toBe(1);
  });
});
