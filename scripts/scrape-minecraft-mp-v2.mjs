#!/usr/bin/env node
/**
 * Scrape minecraft-mp.com - All pages with improved extraction
 * Extracts server addresses, names, and player counts
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function scrapeAllPages() {
  console.log('🚀 Better minecraft-mp.com scraper v2');
  console.log('Target: Extract from link patterns and page structure\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
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
        timeout: 20000 
      });
      
      if (!response || response.status() !== 200) {
        process.stdout.write(`HTTP ${response?.status() || 'error'} `);
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
        continue;
      }
      
      // Wait for content to load
      await page.waitForTimeout(3000);
      
      // Extract all server data from the page
      const pageData = await page.evaluate(() => {
        const results = [];
        
        // Strategy 1: Look for server entries in the page structure
        // Server entries typically have consistent structure with name, address, players
        const allElements = document.querySelectorAll('*');
        
        for (const el of allElements) {
          const text = el.textContent || '';
          
          // Pattern: Country followed by server address
          // e.g., "United States of America mp.opblocks.com"
          const patterns = [
            /United States of America\s+([a-zA-Z0-9._:-]+)/,
            /Turkey\s+([a-zA-Z0-9._:-]+)/,
            /Romania\s+([a-zA-Z0-9._:-]+)/,
            /United Kingdom\s+([a-zA-Z0-9._:-]+)/,
            /Germany\s+([a-zA-Z0-9._:-]+)/,
            /Brazil\s+([a-zA-Z0-9._:-]+)/,
            /Philippines\s+([a-zA-Z0-9._:-]+)/,
            /Indonesia\s+([a-zA-Z0-9._:-]+)/,
            /Europe\s+([a-zA-Z0-9._:-]+)/,
          ];
          
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              const address = match[1].toLowerCase().trim();
              
              // Validate it's a real server address
              if (address.includes('.') && 
                  address.length > 5 &&
                  address.length < 50 &&
                  !address.includes('minecraft-mp.com') &&
                  !address.includes('contact@') &&
                  !address.includes('@')) {
                
                // Try to find player count nearby
                let playersOnline = 0;
                let maxPlayers = 0;
                
                // Look for player counts like "727 / 1000" or "Online" indicators
                const parent = el.parentElement;
                if (parent) {
                  const parentText = parent.textContent || '';
                  const playerMatch = parentText.match(/(\d+)\s*\/\s*(\d+)/);
                  if (playerMatch) {
                    playersOnline = parseInt(playerMatch[1]);
                    maxPlayers = parseInt(playerMatch[2]);
                  }
                }
                
                // Look for version nearby
                let version = '';
                const versionMatch = text.match(/(\d+\.\d+(?:\.\d+)?)/);
                if (versionMatch) version = versionMatch[1];
                
                results.push({
                  address,
                  playersOnline,
                  maxPlayers,
                  version,
                  sourceText: text.substring(0, 100)
                });
              }
            }
          }
        }
        
        return results;
      });
      
      // Add unique servers
      let newCount = 0;
      for (const server of pageData) {
        if (!seen.has(server.address)) {
          seen.add(server.address);
          server.page = pageNum;
          servers.push(server);
          newCount++;
        }
      }
      
      process.stdout.write(`+${newCount} new | Total: ${servers.length} `);
      
      if (newCount === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 5) {
          console.log('\n\n⏹️  5 empty pages, stopping');
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
  
  // JSON with full details
  writeFileSync(`mc_mp_v2_${timestamp}.json`, JSON.stringify({
    scraped_at: new Date().toISOString(),
    total: servers.length,
    source: 'minecraft-mp.com',
    servers
  }, null, 2));
  
  // Simple text list
  const addresses = servers.map(s => s.address).join('\n');
  writeFileSync(`mc_mp_v2_${timestamp}.txt`, addresses);
  
  console.log(`\n\n✅ DONE! Found ${servers.length} unique servers`);
  console.log(`📁 JSON: mc_mp_v2_${timestamp}.json`);
  console.log(`📁 TXT: mc_mp_v2_${timestamp}.txt`);
  
  // Show top servers by player count
  console.log('\n📝 Top servers by player count:');
  const sorted = [...servers].sort((a, b) => b.playersOnline - a.playersOnline);
  sorted.slice(0, 15).forEach(s => {
    console.log(`  - ${s.address} (${s.playersOnline}/${s.maxPlayers} players)`);
  });
}

scrapeAllPages().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});