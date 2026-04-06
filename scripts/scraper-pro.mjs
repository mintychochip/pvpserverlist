#!/usr/bin/env node
/**
 * Guild Post Server Scraper - Production Edition
 * Targets sites that actually expose server IPs
 * Uses intelligent extraction and caching
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Output files
const OUTPUT_JSON = join(__dirname, '..', 'servers_scraped.json');
const OUTPUT_TXT = join(__dirname, '..', 'servers_scraped.txt');
const PROGRESS_FILE = join(__dirname, '.scrape_progress.json');

// High-value sources that expose IPs without heavy anti-bot
const SOURCES = [
  {
    name: 'minecraft-list.cz',
    url: 'https://minecraft-list.cz',
    enabled: true,
    pages: 100,
    extractFromList: true,
    selectors: {
      rows: 'table.server-list tr, .server-item, .server-row',
      name: 'td:nth-child(2) a, .server-name, h3',
      ip: 'td:nth-child(3), .server-ip, .address code',
      port: 'td:nth-child(4), .server-port',
      players: 'td:nth-child(5), .players, .online-players',
      version: 'td:nth-child(6), .version'
    }
  },
  {
    name: 'minecraft-server.eu',
    url: 'https://minecraft-server.eu',
    enabled: true,
    pages: 50,
    extractFromList: true,
    selectors: {
      rows: '.server-entry, .server-item',
      name: '.server-name, h3, .name',
      ip: '.server-address, .ip, .server-ip',
      players: '.player-count, .players',
      version: '.version'
    }
  },
  {
    name: 'craftlist.org',
    url: 'https://craftlist.org',
    enabled: true,
    pages: 50,
    extractFromList: true,
    selectors: {
      rows: '.server-card, .server-item',
      name: '.server-title, h3, .name',
      ip: '.server-ip, .address',
      players: '.players-online, .player-count'
    }
  },
  {
    name: 'mc-lists.org',
    url: 'https://mc-lists.org',
    enabled: true,
    pages: 50,
    extractFromList: true,
    selectors: {
      rows: '.server-entry, .server-row',
      name: '.name, .server-name',
      ip: '.ip-address, .server-ip',
      players: '.players'
    }
  }
];

class ServerScraper {
  constructor() {
    this.servers = new Map();
    this.progress = this.loadProgress();
    this.browser = null;
  }

  loadProgress() {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
    }
    return { completed: [], lastRun: null };
  }

  saveProgress() {
    writeFileSync(PROGRESS_FILE, JSON.stringify(this.progress, null, 2));
  }

  async init() {
    console.log('🚀 Initializing browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    console.log('✅ Browser ready\n');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async scrapeSource(source) {
    if (!source.enabled) {
      console.log(`⏭️  Skipping ${source.name} (disabled)`);
      return 0;
    }

    console.log(`\n🌐 Scraping ${source.name} (${source.pages} pages max)`);
    
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US'
    });

    const page = await context.newPage();
    let added = 0;
    let consecutiveEmpty = 0;

    try {
      for (let pageNum = 1; pageNum <= source.pages; pageNum++) {
        const pageUrl = pageNum === 1 
          ? source.url 
          : `${source.url}/page/${pageNum}`;

        console.log(`  📄 Page ${pageNum}: ${pageUrl}`);

        try {
          await page.goto(pageUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000 
          });
          await page.waitForTimeout(2000);

          // Extract servers from this page
          const pageServers = await this.extractServers(page, source.selectors, pageUrl);
          
          // Add to collection
          for (const server of pageServers) {
            const key = `${server.ip}:${server.port}`;
            if (!this.servers.has(key)) {
              this.servers.set(key, {
                ...server,
                source: source.name,
                scraped_at: new Date().toISOString()
              });
              added++;
            }
          }

          console.log(`     ✅ Found ${pageServers.length} servers (+${added} total)`);

          // Check for consecutive empty pages
          if (pageServers.length === 0) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 3) {
              console.log(`     ⏹️  3 empty pages, stopping`);
              break;
            }
          } else {
            consecutiveEmpty = 0;
          }

        } catch (err) {
          console.log(`     ⚠️  Error: ${err.message}`);
          break;
        }
      }
    } finally {
      await context.close();
    }

    console.log(`  📊 ${source.name}: ${added} new servers`);
    return added;
  }

  async extractServers(page, selectors, baseUrl) {
    return await page.evaluate((sel, baseUrl) => {
      const servers = [];
      const rows = document.querySelectorAll(sel.rows);
      
      rows.forEach(row => {
        const getText = (selector) => {
          const el = row.querySelector(selector);
          return el ? el.textContent.trim() : '';
        };

        const getAttr = (selector, attr) => {
          const el = row.querySelector(selector);
          return el ? el.getAttribute(attr) : '';
        };

        const name = getText(sel.name);
        let ip = getText(sel.ip);
        let port = parseInt(getText(sel.port)) || 25565;
        
        // Try to parse IP:port combo
        if (ip.includes(':')) {
          const parts = ip.split(':');
          ip = parts[0];
          port = parseInt(parts[1]) || 25565;
        }

        // Skip if no valid IP
        if (!ip || ip.length < 3) return;

        const playersText = getText(sel.players);
        const playersMatch = playersText.match(/(\d+)\s*\/\s*(\d+)/);
        
        // Extract icon and banner if available
        let icon = null;
        let banner = null;
        
        // Try to find icon image
        const iconEl = row.querySelector('img.server-icon, .server-icon img, img[width="64"], img[alt*="icon"]');
        if (iconEl) {
          let src = iconEl.getAttribute('src');
          if (src) {
            if (src.startsWith('//')) src = 'https:' + src;
            else if (src.startsWith('/')) src = new URL(src, baseUrl).href;
            else if (!src.startsWith('http')) src = new URL(src, baseUrl).href;
            icon = src;
          }
        }
        
        // Try to find banner image
        const bannerEl = row.querySelector('img.server-banner, .server-banner img, img[width="1200"], img[width="1920"]');
        if (bannerEl) {
          let src = bannerEl.getAttribute('src');
          if (src) {
            if (src.startsWith('//')) src = 'https:' + src;
            else if (src.startsWith('/')) src = new URL(src, baseUrl).href;
            else if (!src.startsWith('http')) src = new URL(src, baseUrl).href;
            banner = src;
          }
        }
        
        servers.push({
          name: name || 'Unnamed Server',
          ip,
          port,
          players_online: playersMatch ? parseInt(playersMatch[1]) : 0,
          max_players: playersMatch ? parseInt(playersMatch[2]) : 0,
          version: getText(sel.version) || '1.20+',
          description: `${name || 'Minecraft'} server`,
          tags: ['Multiplayer'],
          icon,
          banner
        });
      });

      return servers;
    }, selectors, baseUrl);
  }

  async run() {
    console.log('='.repeat(50));
    console.log('🔍 Guild Post Server Scraper - Production');
    console.log(`🎯 Target: ${SOURCES.filter(s => s.enabled).length} sources`);
    console.log('='.repeat(50));

    await this.init();

    let totalAdded = 0;
    
    for (const source of SOURCES) {
      const added = await this.scrapeSource(source);
      totalAdded += added;
      
      // Save progress after each source
      this.progress.completed.push({
        source: source.name,
        added,
        timestamp: new Date().toISOString()
      });
      this.saveProgress();
    }

    await this.close();

    // Save results
    const serverArray = Array.from(this.servers.values());
    
    writeFileSync(OUTPUT_JSON, JSON.stringify({
      scraped_at: new Date().toISOString(),
      total: serverArray.length,
      sources: this.progress.completed,
      servers: serverArray
    }, null, 2));

    writeFileSync(OUTPUT_TXT, serverArray.map(s => 
      `${s.ip}:${s.port} | ${s.name} | ${s.source}`
    ).join('\n'));

    console.log('\n' + '='.repeat(50));
    console.log(`🎉 DONE! Total unique servers: ${serverArray.length}`);
    console.log(`📁 JSON: ${OUTPUT_JSON}`);
    console.log(`📁 TXT: ${OUTPUT_TXT}`);
    console.log('='.repeat(50));

    // Show sample
    console.log('\n📝 Sample servers:');
    serverArray.slice(0, 10).forEach(s => {
      console.log(`  - ${s.name} (${s.ip}:${s.port}) [${s.source}]`);
    });
    if (serverArray.length > 10) {
      console.log(`  ... and ${serverArray.length - 10} more`);
    }
  }
}

// Run scraper
const scraper = new ServerScraper();
scraper.run().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
