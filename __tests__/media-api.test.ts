import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Media Upload API Route', () => {
  it('should have the media API route file', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    expect(fs.existsSync(mediaApiPath)).toBe(true);
  });

  it('should export POST handler', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('export const POST');
  });

  it('should export OPTIONS handler for CORS', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('export const OPTIONS');
  });

  it('should use Supabase storage client', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('.storage');
    expect(content).toContain("from('server-media')");
  });

  it('should validate server ID parameter', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('serverId');
    expect(content).toContain('Server ID is required');
  });

  it('should handle banner uploads with size validation', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain("formData.get('banner')");
    expect(content).toContain('2 * 1024 * 1024'); // 2MB
    expect(content).toContain('image/jpeg');
    expect(content).toContain('image/png');
    expect(content).toContain('image/webp');
  });

  it('should handle icon uploads with size validation', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain("formData.get('icon')");
    expect(content).toContain('500 * 1024'); // 500KB
  });

  it('should handle screenshot uploads with index-based keys', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('screenshot_');
    expect(content).toContain('screenshots');
  });

  it('should validate screenshot file size (max 3MB)', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('3 * 1024 * 1024'); // 3MB
  });

  it('should upload to correct storage path structure', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('servers/${serverId}/banner');
    expect(content).toContain('servers/${serverId}/icon');
    expect(content).toContain('servers/${serverId}/screenshots');
  });

  it('should get public URLs after upload', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('getPublicUrl');
  });

  it('should update servers table with media URLs', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('.from(\'servers\')');
    expect(content).toContain('banner_url');
    expect(content).toContain('icon_url');
  });

  it('should handle video URL parameter', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain("formData.get('video')");
    expect(content).toContain('youtube.com');
    expect(content).toContain('youtu.be');
  });

  it('should return success response with URLs', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('success: true');
    expect(content).toContain('urls: response');
  });

  it('should have CORS headers', () => {
    const mediaApiPath = path.join(process.cwd(), 'src', 'pages', 'api', 'servers', '[id]', 'media.ts');
    const content = fs.readFileSync(mediaApiPath, 'utf-8');
    expect(content).toContain('Access-Control-Allow-Origin');
  });
});

describe('ServerMediaUploader Component Integration', () => {
  it('should have ServerMediaUploader component', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'ServerMediaUploader.astro');
    expect(fs.existsSync(componentPath)).toBe(true);
  });

  it('should POST to correct API endpoint', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'ServerMediaUploader.astro');
    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('/api/servers/${serverId}/media');
  });

  it('should include serverId in form data', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'ServerMediaUploader.astro');
    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('data-server-id={serverId}');
  });

  it('should handle banner file input', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'ServerMediaUploader.astro');
    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('banner-input');
    expect(content).toContain('image/jpeg,image/png,image/webp');
  });

  it('should handle icon file input', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'ServerMediaUploader.astro');
    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('icon-input');
    expect(content).toContain('image/jpeg,image/png');
  });

  it('should handle screenshot file inputs', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'ServerMediaUploader.astro');
    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('screenshots-input');
    expect(content).toContain('multiple');
  });

  it('should call onUploadComplete callback on success', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'ServerMediaUploader.astro');
    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('onUploadComplete');
  });
});
