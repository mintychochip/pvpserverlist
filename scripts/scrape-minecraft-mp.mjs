#!/usr/bin/env node
/**
 * Better Browser-based scraper for minecraft-mp.com
 * Extracts server addresses, names, player counts, and tags
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function scrapeMinecraftMP() {
  console.log('🚀 Better minecraft-mp.com scraper');
  console.log('Target: Extract server addresses from link text patterns');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0'
  });
  
  const servers = [];
  const seen = new Set();
  const maxPages = 100;
  let emptyCount = 0;
  
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    if (emptyCount >= 3) {
      console.log('\n⏹️  3 empty pages in a row, stopping');
      break;
    }
    
    const page = await context.newPage();
    
    try {
      process.stdout.write(`\r📄 Page ${pageNum}/${maxPages}... `);
      
      const url = pageNum === 1 
        ? 'https://minecraft-mp.com/'
        : `https://minecraft-mp.com/servers/${pageNum}/`;
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);
      
      // Better extraction - get server cards/containers
      const pageServers = await page.evaluate(() => {
        const results = [];
        
        // Find all server entry containers
        // minecraft-mp.com typically has server entries with class names or specific structure
        const serverEntries = document.querySelectorAll('.server, .server-item, [class*="server"]');
        
        // Also look for table rows that contain server data
        const tableRows = document.querySelectorAll('tr');
        
        [...serverEntries, ...tableRows].forEach(entry => {
          const text = entry.textContent;
          
          // Pattern: Look for "Country server.address.com" in link text
          // e.g., "United States of America mp.opblocks.com"
          const addressMatch = text.match(/(?:[A-Za-z\s]+)\s+([a-zA-Z0-9._-]+\.[a-zA-Z]{2,}(?::\d+)?)/);
          
          if (addressMatch) {
            const address = addressMatch[1].toLowerCase().trim();
            
            // Validate it's a real server address (not a false positive)
            if (address.includes('.') && 
                !address.includes('minecraft-mp.com') &&
                !address.includes('gmail.com') &&
                !address.includes('contact@') &&
                address.length > 5) {
              
              // Try to find player count
              const playerMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
              const playersOnline = playerMatch ? parseInt(playerMatch[1]) : 0;
              const maxPlayers = playerMatch ? parseInt(playerMatch[2]) : 0;
              
              // Try to find version
              const versionMatch = text.match(/(\d+\.\d+(?:\.\d+)?)/);
              const version = versionMatch ? versionMatch[1] : '';
              
              results.push({
                address,
                playersOnline,
                maxPlayers,
                version,
                source: 'minecraft-mp.com',
                page: 0
              });
            }
          }
        });
        
        // Also directly search all links for address patterns
        const links = document.querySelectorAll('a');
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const text = link.textContent.trim();
          
          // Look for links that go to /server/xxx (these often have the address nearby)
          if (href.includes('/server/')) {
            // Check nearby elements for the address
            const parent = link.parentElement;
            if (parent) {
              const parentText = parent.textContent;
              const match = parentText.match(/([a-zA-Z0-9._-]+\.[a-zA-Z]{2,}(?::\d+)?)/);
              if (match && !seen.has(match[1])) {
                const addr = match[1].toLowerCase();
                if (addr.includes('.') && addr.length > 5) {
                  results.push({
                    address: addr,
                    playersOnline: 0,
                    maxPlayers: 0,
                    version: '',
                    source: 'minecraft-mp.com',
                    page: 0
                  });
                }
              }
            }
          }
        });
        
        return results;
      });
      
      // Filter out duplicates and add to list
      let newCount = 0;
      pageServers.forEach(server => {
        if (!seen.has(server.address)) {
          seen.add(server.address);
          server.page = pageNum;
          servers.push(server);
          newCount++;
        }
      });
      
      process.stdout.write(`+${newCount} new | Total: ${servers.length}`);
      
      if (newCount === 0) {
        emptyCount++;
      } else {
        emptyCount = 0;
      }
      
    } catch (err) {
      process.stdout.write(`⚠️  Error: ${err.message}`);
    } finally {
      await page.close();
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  await browser.close();
  
  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // JSON with full data
  writeFileSync(`minecraft_mp_detailed_${timestamp}.json`, JSON.stringify({
    scraped_at: new Date().toISOString(),
    total: servers.length,
    source: 'minecraft-mp.com',
    servers
  }, null, 2));
  
  // Plain text list
  const addresses = servers.map(s => s.address).join('\n');
  writeFileSync(`minecraft_mp_addresses_${timestamp}.txt`, addresses);
  
  console.log(`\n\n✅ DONE! Found ${servers.length} unique servers`);
  console.log(`📁 JSON: minecraft_mp_detailed_${timestamp}.json`);
  console.log(`📁 TXT: minecraft_mp_addresses_${timestamp}.txt`);
  
  // Show sample
  console.log('\n📝 Sample servers:');
  servers.slice(0, 10).forEach(s => {
    console.log(`  - ${s.address} (${s.playersOnline}/${s.maxPlayers} players)`);
  });
  if (servers.length > 10) {
    console.log(`  ... and ${servers.length - 10} more`);
  }
}

scrapeMinecraftMP().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
