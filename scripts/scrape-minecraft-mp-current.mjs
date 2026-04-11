#!/usr/bin/env node
/**
 * Scrape minecraft-mp.com - Current site structure (April 2026)
 * Extracts server addresses from the table structure
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

async function validateServer(ip) {
  try {
    await dnsLookup(ip);
    return true;
  } catch (e) {
    return false;
  }
}

async function scrapeMinecraftMP() {
  console.log('🚀 Scraping minecraft-mp.com - Current Structure');
  console.log('Target: Server table with IP addresses\n');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const servers = [];
  const seen = new Set();
  const maxPages = 100;
  let consecutiveEmpty = 0;
  
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await context.newPage();
    
    try {
      process.stdout.write(`\r📄 Page ${pageNum}/${maxPages}... `);
      
      const url = pageNum === 1 
        ? 'https://minecraft-mp.com/'
        : `https://minecraft-mp.com/servers/${pageNum}/`;
      
      const response = await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 25000 
      });
      
      if (!response || response.status() !== 200) {
        process.stdout.write(`HTTP ${response?.status() || 'error'} `);
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
        continue;
      }
      
      // Wait for table to load
      await page.waitForTimeout(3000);
      
      // Extract server data from the table
      const pageData = await page.evaluate(() => {
        const results = [];
        
        // Find all table rows
        const rows = document.querySelectorAll('table tbody tr, table tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return;
          
          // Cell 0: Rank/Premium badge
          // Cell 1: Location + IP (e.g., "United States of America mp.opblocks.com")
          // Cell 2: Description with tags
          // Cell 3: Status + Players + Version
          
          const locationCell = cells[1];
          const descCell = cells[2];
          const statusCell = cells[3];
          
          if (!locationCell || !descCell || !statusCell) return;
          
          // Extract server name from first link in location cell
          const nameLink = locationCell.querySelector('a');
          const name = nameLink ? nameLink.textContent.trim() : 'Minecraft Server';
          
          // Extract IP from location cell - look for domain patterns
          const cellText = locationCell.textContent || '';
          
          // Pattern: Country followed by domain
          // e.g., "United States of America mp.opblocks.com"
          const domainMatch = cellText.match(/[a-zA-Z0-9.-]+\.\w{2,}$/);
          if (!domainMatch) return;
          
          const ip = domainMatch[0].toLowerCase().trim();
          
          // Skip if it looks like a country name
          if (ip.includes(' ') || ip.length < 5) return;
          
          // Extract player count from status cell
          const statusText = statusCell.textContent || '';
          const playersMatch = statusText.match(/(\d+)\s*\/\s*(\d+)/);
          const playersOnline = playersMatch ? parseInt(playersMatch[1]) : 0;
          const maxPlayers = playersMatch ? parseInt(playersMatch[2]) : 0;
          
          // Check if online
          const isOnline = statusText.toLowerCase().includes('online');
          
          // Extract version
          const versionMatch = statusText.match(/(\d+\.\d+[.\d]*)/);
          const version = versionMatch ? versionMatch[1] : '1.20+';
          
          // Extract tags from description cell
          const tags = [];
          const tagLinks = descCell.querySelectorAll('a[href*="/type/"]');
          tagLinks.forEach(link => {
            const tag = link.textContent.trim();
            if (tag && !tags.includes(tag)) tags.push(tag);
          });
          
          results.push({
            name,
            ip,
            port: 25565,
            players_online: playersOnline,
            max_players: maxPlayers,
            version,
            status: isOnline ? 'online' : 'unknown',
            tags: tags.length > 0 ? tags : ['Multiplayer'],
            source: 'minecraft-mp.com'
          });
        });
        
        return results;
      });
      
      // Filter and add unique servers
      let newCount = 0;
      for (const server of pageData) {
        const key = `${server.ip}:${server.port}`;
        if (!seen.has(key)) {
          seen.add(key);
          
          // Validate the server is resolvable
          const isValid = await validateServer(server.ip);
          if (isValid) {
            server.page = pageNum;
            servers.push(server);
            newCount++;
          }
        }
      }
      
      process.stdout.write(`+${newCount} new | Total: ${servers.length} `);
      
      if (newCount === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) {
          console.log('\n\n⏹️  3 empty pages, stopping');
          break;
        }
      } else {
        consecutiveEmpty = 0;
      }
      
    } catch (err) {
      process.stdout.write(`⚠️  ${err.message.substring(0, 30)} `);
      consecutiveEmpty++;
    } finally {
      await page.close();
    }
    
    // Be nice to the server
    await new Promise(r => setTimeout(r, 1500));
  }
  
  await browser.close();
  
  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  writeFileSync(`mc_mp_current_${timestamp}.json`, JSON.stringify({
    scraped_at: new Date().toISOString(),
    total: servers.length,
    source: 'minecraft-mp.com',
    servers
  }, null, 2));
  
  const addresses = servers.map(s => `${s.ip}:${s.port}`).join('\n');
  writeFileSync(`mc_mp_current_${timestamp}.txt`, addresses);
  
  console.log(`\n\n✅ DONE! Found ${servers.length} unique servers`);
  console.log(`📁 JSON: mc_mp_current_${timestamp}.json`);
  console.log(`📁 TXT: mc_mp_current_${timestamp}.txt`);
  
  // Show top servers by player count
  console.log('\n📝 Top servers by player count:');
  const sorted = [...servers].sort((a, b) => b.players_online - a.players_online);
  sorted.slice(0, 15).forEach(s => {
    console.log(`  - ${s.name} (${s.ip}) - ${s.players_online}/${s.max_players} players - ${s.tags.slice(0, 3).join(', ')}`);
  });
  
  return servers;
}

scrapeMinecraftMP().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
