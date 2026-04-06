#!/usr/bin/env node
/**
 * Guild Post Icon & Banner Scraper
 * Scrapes server icons and banners from server websites
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Supabase credentials - using anon key for reading, service role would be needed for updates
const SUPABASE_URL = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTEwMDQsImV4cCI6MjA5MDkyNzAwNH0.35hrTSgxQnICpLOY3g6W3eNxxe7DKCc3q165tyb0Ieo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Progress tracking
const PROGRESS_FILE = join(__dirname, '.scrape_images_progress.json');

class ImageScraper {
  constructor() {
    this.browser = null;
    this.processed = new Set();
    this.progress = this.loadProgress();
  }

  loadProgress() {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
    }
    return { processed: [], failed: [], lastRun: null };
  }

  saveProgress() {
    writeFileSync(PROGRESS_FILE, JSON.stringify(this.progress, null, 2));
  }

  async init() {
    console.log('🚀 Initializing browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
    console.log('✅ Browser ready\n');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async getServersNeedingImages() {
    console.log('📊 Fetching servers without icons/banners...');
    
    const { data: servers, error } = await supabase
      .from('servers')
      .select('id, name, ip, website, icon, banner')
      .or('icon.is.null,banner.is.null')
      .limit(50);

    if (error) {
      console.error('❌ Error fetching servers:', error);
      return [];
    }

    console.log(`🔍 Found ${servers.length} servers needing images\n`);
    return servers;
  }

  async scrapeServerImages(server) {
    const { id, name, ip, website } = server;
    
    // Skip if already processed this session
    if (this.processed.has(id)) {
      return null;
    }
    this.processed.add(id);

    console.log(`🖼️  Processing: ${name} (${ip})`);

    let iconUrl = null;
    let bannerUrl = null;
    let websiteUrl = website;

    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    try {
      // If no website provided, try common patterns
      if (!websiteUrl) {
        websiteUrl = await this.guessWebsite(ip, name);
      }

      if (!websiteUrl) {
        console.log(`   ⚠️  No website found for ${name}`);
        this.progress.failed.push({ id, name, reason: 'no_website' });
        return null;
      }

      console.log(`   🌐 Website: ${websiteUrl}`);

      const page = await context.newPage();
      
      try {
        await page.goto(websiteUrl, { 
          waitUntil: 'networkidle', 
          timeout: 15000 
        });
      } catch (err) {
        console.log(`   ⚠️  Failed to load website: ${err.message}`);
        this.progress.failed.push({ id, name, reason: 'website_load_failed' });
        return null;
      }

      // Try to find icon
      iconUrl = await this.extractIcon(page, websiteUrl);
      
      // Try to find banner
      bannerUrl = await this.extractBanner(page, websiteUrl);

      await page.close();

      const result = { id, name, iconUrl, bannerUrl, website: websiteUrl };
      
      if (iconUrl || bannerUrl) {
        console.log(`   ✅ Found: ${iconUrl ? 'icon' : ''} ${bannerUrl ? 'banner' : ''}`);
        this.progress.processed.push(result);
        return result;
      } else {
        console.log(`   ⚠️  No images found`);
        this.progress.failed.push({ id, name, reason: 'no_images_found' });
        return null;
      }

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      this.progress.failed.push({ id, name, reason: err.message });
      return null;
    } finally {
      await context.close();
    }
  }

  async guessWebsite(ip, name) {
    // Common patterns to try
    const patterns = [
      `https://${ip}`,
      `https://www.${ip}`,
      `https://${name.toLowerCase().replace(/\s+/g, '')}.com`,
      `https://${name.toLowerCase().replace(/\s+/g, '')}.net`,
      `https://${name.toLowerCase().replace(/\s+/g, '')}.gg`,
      `https://www.${name.toLowerCase().replace(/\s+/g, '')}.com`,
    ];

    // If IP looks like a domain, use it
    if (ip.includes('.')) {
      const domainParts = ip.split('.');
      if (domainParts.length >= 2 && !ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        patterns.unshift(`https://${ip}`, `https://www.${ip}`);
      }
    }

    for (const url of patterns) {
      try {
        const response = await fetch(url, { 
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
          return url;
        }
      } catch {
        // Continue to next pattern
      }
    }

    return null;
  }

  async extractIcon(page, baseUrl) {
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'meta[property="og:image"]',
      'img[alt*="logo" i]',
      'img[alt*="icon" i]',
      'img[class*="logo" i]',
      'img[class*="icon" i]',
      '.server-icon img',
      '.favicon img'
    ];

    for (const selector of selectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          let src = null;
          
          if (selector.includes('meta')) {
            src = await element.getAttribute('content');
          } else {
            src = await element.getAttribute('src');
          }

          if (src) {
            // Make absolute URL
            if (src.startsWith('//')) {
              src = 'https:' + src;
            } else if (src.startsWith('/')) {
              const url = new URL(baseUrl);
              src = `${url.protocol}//${url.host}${src}`;
            } else if (!src.startsWith('http')) {
              src = new URL(src, baseUrl).href;
            }
            
            // Validate it's an image URL
            if (src.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?.*)?$/i)) {
              return src;
            }
          }
        }
      } catch {
        // Continue to next selector
      }
    }

    // Try default favicon location
    const url = new URL(baseUrl);
    const defaultFavicon = `${url.protocol}//${url.host}/favicon.ico`;
    
    try {
      const response = await fetch(defaultFavicon, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        return defaultFavicon;
      }
    } catch {
      // Favicon doesn't exist
    }

    return null;
  }

  async extractBanner(page, baseUrl) {
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'img[alt*="banner" i]',
      'img[class*="banner" i]',
      '.banner img',
      '.header-banner img',
      '.hero img',
      '.cover img',
      'img[width="1200"]',
      'img[width="1920"]'
    ];

    for (const selector of selectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          let src = await element.getAttribute('src') || await element.getAttribute('content');

          if (src) {
            // Make absolute URL
            if (src.startsWith('//')) {
              src = 'https:' + src;
            } else if (src.startsWith('/')) {
              const url = new URL(baseUrl);
              src = `${url.protocol}//${url.host}${src}`;
            } else if (!src.startsWith('http')) {
              src = new URL(src, baseUrl).href;
            }
            
            // Validate it's an image URL
            if (src.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?.*)?$/i)) {
              // Skip small icons (banners are usually larger)
              if (!src.includes('favicon') && !src.includes('icon')) {
                return src;
              }
            }
          }
        }
      } catch {
        // Continue to next selector
      }
    }

    return null;
  }

  async updateServerImages(serverId, iconUrl, bannerUrl) {
    const updates = {};
    if (iconUrl) updates.icon = iconUrl;
    if (bannerUrl) updates.banner = bannerUrl;

    if (Object.keys(updates).length === 0) return;

    // Try to update database
    const { error } = await supabase
      .from('servers')
      .update(updates)
      .eq('id', serverId);

    if (error) {
      console.log(`   ⚠️  Database update skipped (no write permissions)`);
      console.log(`   📝 Icon: ${iconUrl || 'none'}`);
      console.log(`   📝 Banner: ${bannerUrl || 'none'}`);
      // Save to local file for manual import
      this.pendingUpdates = this.pendingUpdates || [];
      this.pendingUpdates.push({ id: serverId, ...updates });
    } else {
      console.log(`   💾 Saved to database`);
    }
  }
  
  savePendingUpdates() {
    if (this.pendingUpdates && this.pendingUpdates.length > 0) {
      const outputFile = join(__dirname, '..', 'server-images-pending.json');
      writeFileSync(outputFile, JSON.stringify(this.pendingUpdates, null, 2));
      console.log(`\n📝 ${this.pendingUpdates.length} updates saved to: ${outputFile}`);
    }
  }

  async run() {
    console.log('='.repeat(60));
    console.log('🖼️  Guild Post Icon & Banner Scraper');
    console.log('='.repeat(60));

    await this.init();

    const servers = await this.getServersNeedingImages();
    
    if (servers.length === 0) {
      console.log('✅ No servers need images!');
      await this.close();
      return;
    }

    let updated = 0;
    
    for (const server of servers) {
      const result = await this.scrapeServerImages(server);
      
      if (result) {
        await this.updateServerImages(
          result.id, 
          result.iconUrl, 
          result.bannerUrl
        );
        updated++;
      }

      // Save progress after each server
      this.saveProgress();

      // Small delay between servers
      await new Promise(r => setTimeout(r, 1000));
    }

    await this.close();

    console.log('\n' + '='.repeat(60));
    console.log(`🎉 DONE! Updated ${updated} servers`);
    console.log(`📊 Total processed: ${this.progress.processed.length}`);
    console.log(`📊 Total failed: ${this.progress.failed.length}`);
    console.log('='.repeat(60));

    this.savePendingUpdates();
    this.saveProgress();
  }
}

// Run scraper
const scraper = new ImageScraper();
scraper.run().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
