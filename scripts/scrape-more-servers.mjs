#!/usr/bin/env node
/**
 * Scrape additional Minecraft server lists
 * Targets more sites and validates servers are live before adding
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Supabase client - loaded dynamically when needed
async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_KEY required for import');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Output files
const OUTPUT_JSON = join(__dirname, '..', 'servers_scraped_new.json');
const PROGRESS_FILE = join(__dirname, '.scrape_progress_more.json');

// Additional server list sources to scrape
const SOURCES = [
  {
    name: 'topminecraftservers.org',
    url: 'https://topminecraftservers.org',
    enabled: true,
    pages: 50,
    selectors: {
      rows: '.server-item, .server-row, [class*="server"]',
      name: '.server-name, h3, .title, [class*="name"]',
      ip: '.server-ip, .ip-address, .address, [class*="ip"]',
      players: '.players, .player-count, [class*="player"]',
      version: '.version, [class*="version"]'
    }
  },
  {
    name: 'minecraft-server.net',
    url: 'https://minecraft-server.net',
    enabled: true,
    pages: 50,
    selectors: {
      rows: '.server-item, .listing-item, [class*="server"]',
      name: '.server-title, .name, h2, h3',
      ip: '.server-address, .ip, [class*="address"]',
      players: '.online-players, .players, [class*="online"]',
      version: '.mc-version, .version'
    }
  },
  {
    name: 'mineservers.com',
    url: 'https://mineservers.com',
    enabled: true,
    pages: 30,
    selectors: {
      rows: '.server-entry, .server-card, [class*="server"]',
      name: '.server-name, .title, h3',
      ip: '.server-ip, .host, [class*="host"]',
      players: '.player-count, .players',
      version: '.mc-version'
    }
  },
  {
    name: 'server-list.org',
    url: 'https://server-list.org/minecraft',
    enabled: true,
    pages: 30,
    selectors: {
      rows: '.server-item, .listing, [class*="listing"]',
      name: '.name, .server-name, h3',
      ip: '.ip, .address, [class*="ip"]',
      players: '.players, .online',
      version: '.version'
    }
  },
  {
    name: 'minecraftservers.biz',
    url: 'https://minecraftservers.biz',
    enabled: true,
    pages: 40,
    selectors: {
      rows: '.server-row, .server-item, [class*="server"]',
      name: '.name, .server-name, h3 a',
      ip: '.ip, .server-ip, [class*="ip"]',
      players: '.players, .player-count',
      version: '.version'
    }
  },
  {
    name: 'mcservers.top',
    url: 'https://mcservers.top',
    enabled: true,
    pages: 30,
    selectors: {
      rows: '.server, .server-card, [class*="server"]',
      name: '.title, .name, h3',
      ip: '.ip, .host, [class*="host"]',
      players: '.players, .online',
      version: '.version'
    }
  }
];

// Common patterns for extracting server addresses from text
const IP_PATTERNS = [
  // Domain:port patterns
  /([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.\w+\.\w{2,}):(\d+)/,
  /play\.([a-zA-Z0-9.-]+\.\w{2,}):?(\d*)/i,
  /mc\.([a-zA-Z0-9.-]+\.\w{2,}):?(\d*)/i,
  /server\.([a-zA-Z0-9.-]+\.\w{2,}):?(\d*)/i,
  /([a-zA-Z0-9][a-zA-Z0-9-]{1,30}\.(?:com|net|org|io|gg|me|xyz|club|network|mc)):?(\d*)/i,
  // Raw IP patterns
  /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):?(\d*)/,
  // Common server name patterns
  /([a-zA-Z0-9]{3,20}(?:mc|craft|pixel|mine|block|pvp|smp| factions|skyblock|prison|network))\.(?:com|net|org)/i,
];

function isValidIP(ip) {
  if (!ip) return false;
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*\.[a-zA-Z]{2,}$/;
  return ipv4Pattern.test(ip) || domainPattern.test(ip);
}

function extractServerFromText(text) {
  for (const pattern of IP_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let ip = match[1].toLowerCase().trim();
      let port = parseInt(match[2]) || 25565;
      
      // Clean up the IP
      if (ip.startsWith('.')) ip = ip.slice(1);
      if (ip.endsWith('.')) ip = ip.slice(0, -1);
      
      // Validate
      if (isValidIP(ip) && ip.length > 3 && ip.length < 100) {
        return { ip, port };
      }
    }
  }
  return null;
}

class ServerScraper {
  constructor() {
    this.servers = new Map();
    this.progress = this.loadProgress();
    this.browser = null;
    this.validatedServers = [];
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

  async validateServer(ip, port = 25565) {
    try {
      // Try DNS lookup first
      await dnsLookup(ip);
      return true;
    } catch (e) {
      return false;
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
          await page.waitForTimeout(3000);

          // Extract servers using multiple strategies
          const pageServers = await this.extractServersMultiStrategy(page, source, pageUrl);
          
          // Validate and add servers
          for (const server of pageServers) {
            const key = `${server.ip}:${server.port}`;
            if (!this.servers.has(key)) {
              // Quick validation - check if domain/IP is resolvable
              const isValid = await this.validateServer(server.ip, server.port);
              
              if (isValid) {
                this.servers.set(key, {
                  ...server,
                  source: source.name,
                  scraped_at: new Date().toISOString()
                });
                added++;
              }
            }
          }

          console.log(`     ✅ Found ${pageServers.length} servers (+${added} total unique)`);

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
          console.log(`     ⚠️  Error: ${err.message.substring(0, 50)}`);
          break;
        }
      }
    } finally {
      await context.close();
    }

    console.log(`  📊 ${source.name}: ${added} new servers`);
    return added;
  }

  async extractServersMultiStrategy(page, source, baseUrl) {
    return await page.evaluate(({ sel, baseUrl }) => {
      const servers = [];
      const seen = new Set();
      
      // Strategy 1: Try to use the defined selectors
      const rows = document.querySelectorAll(sel.rows);
      
      rows.forEach(row => {
        const getText = (selector) => {
          if (!selector) return '';
          const el = row.querySelector(selector);
          return el ? el.textContent.trim() : '';
        };

        let name = getText(sel.name);
        let ipText = getText(sel.ip);
        let playersText = getText(sel.players);
        let version = getText(sel.version);

        // If no IP found in selector, try to extract from the whole row text
        if (!ipText) {
          ipText = row.textContent;
        }

        // Parse IP:port from the text
        let ip = '';
        let port = 25565;
        
        // Check for IP:port pattern
        const ipPortMatch = ipText.match(/([a-zA-Z0-9.-]+):(\d+)/);
        if (ipPortMatch) {
          ip = ipPortMatch[1].toLowerCase().trim();
          port = parseInt(ipPortMatch[2]);
        } else {
          // Just domain/IP without port
          const domainMatch = ipText.match(/([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})/);
          if (domainMatch) {
            ip = domainMatch[1].toLowerCase().trim();
          }
        }

        // Skip if no valid IP
        if (!ip || ip.length < 3) return;

        // Parse players
        let playersOnline = 0;
        let maxPlayers = 0;
        const playersMatch = playersText.match(/(\d+)\s*\/\s*(\d+)/);
        if (playersMatch) {
          playersOnline = parseInt(playersMatch[1]);
          maxPlayers = parseInt(playersMatch[2]);
        } else {
          const singleMatch = playersText.match(/(\d+)/);
          if (singleMatch) {
            playersOnline = parseInt(singleMatch[1]);
            maxPlayers = 100;
          }
        }

        // Extract icon
        let icon = null;
        const iconEl = row.querySelector('img[src*="icon"], img[src*="favicon"], .server-icon img');
        if (iconEl) {
          icon = iconEl.getAttribute('src');
        }

        const key = `${ip}:${port}`;
        if (!seen.has(key)) {
          seen.add(key);
          servers.push({
            name: name || 'Minecraft Server',
            ip,
            port,
            players_online: playersOnline,
            max_players: maxPlayers || 100,
            version: version || '1.20+',
            description: `${name || 'Minecraft'} server`,
            tags: ['Multiplayer'],
            icon
          });
        }
      });

      // Strategy 2: If no servers found, scan all text for patterns
      if (servers.length === 0) {
        const allText = document.body.innerText;
        const lines = allText.split('\n');
        
        for (const line of lines) {
          // Look for common patterns like "play.example.com" or "192.168.1.1:25565"
          const patterns = [
            /([a-zA-Z0-9-]+\.\w+\.\w{2,}):(\d{2,5})/,
            /play\.([a-zA-Z0-9.-]+\.\w{2,})/i,
            /mc\.([a-zA-Z0-9.-]+\.\w{2,})/i,
            /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)/,
          ];
          
          for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
              let ip = match[1].toLowerCase().trim();
              let port = parseInt(match[2]) || 25565;
              
              if (ip.length > 3 && ip.length < 100) {
                const key = `${ip}:${port}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  servers.push({
                    name: ip.split('.')[0] || 'Minecraft Server',
                    ip,
                    port,
                    players_online: 0,
                    max_players: 100,
                    version: '1.20+',
                    description: 'Minecraft server',
                    tags: ['Multiplayer']
                  });
                }
              }
            }
          }
        }
      }

      return servers;
    }, { sel: source.selectors, baseUrl });
  }

  async run() {
    console.log('='.repeat(60));
    console.log('🔍 Guild Post Server Scraper - Additional Sources');
    console.log(`🎯 Target: ${SOURCES.filter(s => s.enabled).length} sources`);
    console.log('='.repeat(60));

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

    console.log('\n' + '='.repeat(60));
    console.log(`🎉 DONE! Total unique servers: ${serverArray.length}`);
    console.log(`📁 JSON: ${OUTPUT_JSON}`);
    console.log('='.repeat(60));

    // Show sample
    console.log('\n📝 Sample servers:');
    serverArray.slice(0, 10).forEach(s => {
      console.log(`  - ${s.name} (${s.ip}:${s.port}) [${s.source}]`);
    });
    if (serverArray.length > 10) {
      console.log(`  ... and ${serverArray.length - 10} more`);
    }

    return serverArray;
  }
}

// Import to Supabase function
async function importToSupabase(servers) {
  console.log('\n📥 Importing to Supabase...');
  
  const supabase = await getSupabase();
  
  // Check for existing IPs
  const { data: existing, error: existingError } = await supabase
    .from('servers')
    .select('ip');
    
  if (existingError) {
    console.error('❌ Error checking existing servers:', existingError.message);
    return;
  }
  
  const existingIps = new Set(existing?.map(s => s.ip) || []);
  
  // Prepare server records
  const newServers = servers
    .filter(s => !existingIps.has(s.ip))
    .map((s, index) => ({
      id: `scraped-${Date.now()}-${index}`,
      ip: s.ip,
      port: s.port || 25565,
      name: s.name || 'Minecraft Server',
      description: s.description || `${s.name || 'Minecraft'} server`,
      version: s.version || '1.20+',
      tags: s.tags || ['Multiplayer'],
      edition: 'java',
      verified: false,
      vote_count: 0,
      players_online: s.players_online || 0,
      max_players: s.max_players || 100,
      status: 'unknown',
      icon: s.icon || null,
      banner: s.banner || null,
      source: s.source || 'scraped',
      created_at: new Date().toISOString()
    }));
  
  console.log(`📊 ${servers.length} total, ${newServers.length} new (skipped ${servers.length - newServers.length} duplicates)`);
  
  if (newServers.length === 0) {
    console.log('✅ All servers already in database!');
    return 0;
  }
  
  // Insert in batches
  const batchSize = 50;
  let inserted = 0;
  
  for (let i = 0; i < newServers.length; i += batchSize) {
    const batch = newServers.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('servers')
      .insert(batch);
    
    if (error) {
      console.error(`  ❌ Batch ${i / batchSize + 1} failed:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  ✅ Progress: ${inserted}/${newServers.length}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n\n🎉 Imported ${inserted} new servers into Guild Post!`);
  return inserted;
}

// Main execution
async function main() {
  const shouldImport = process.argv.includes('--import');
  
  const scraper = new ServerScraper();
  const servers = await scraper.run();
  
  if (shouldImport && servers.length > 0) {
    await importToSupabase(servers);
  } else if (servers.length > 0) {
    console.log('\n💡 Run with --import flag to add these to the database');
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
