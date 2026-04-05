#!/usr/bin/env node
/**
 * Scrape real video banners from minecraft-mp.com
 * Premium servers upload .mp4 banners at:
 *   https://minecraft-mp.com/images/banners/banner-{id}-{timestamp}.mp4
 *
 * Downloads video banners to Supabase Storage and updates DB.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM1MTAwNCwiZXhwIjoyMDkwOTI3MDA0fQ.XhD7HSa1RwnfhP5pCeHQ2dLErAPFysT2BkRF2VQVozE';
const BUCKET = 'banners';

const MP_BASE = 'https://minecraft-mp.com';

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchRaw(url, retries = 2) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          if (retries > 0) { delay(1000).then(() => resolve(fetchRaw(url, retries - 1))); }
          else resolve(null);
        } else resolve(data);
      });
    }).on('error', () => {
      if (retries > 0) { delay(1000).then(() => resolve(fetchRaw(url, retries - 1))); }
      else resolve(null);
    });
  });
}

/**
 * Parse a minecraft-mp.com listing page for server video banners.
 * 
 * Page structure:
 *   <video class="mp4-fluid" src="https://minecraft-mp.com/images/banners/banner-159193-1744984544.mp4" ... title="Server Name">
 *   Nearby: server IP, ID, etc.
 */
function parseBannersFromPage(html) {
  const results = [];
  
  // Find all video banners with their container context
  // Each banner is wrapped in a table row <tr>
  const trRegex = /<tr>(.*?)<\/tr>/gs;
  let trMatch;
  
  while ((trMatch = trRegex.exec(html)) !== null) {
    const tr = trMatch[1];
    
    // Find video in this row
    const videoMatch = tr.match(/<video[^>]*class="mp4-fluid"[^>]*src="([^"]+)"[^>]*title="([^"]+)"/i);
    if (!videoMatch) continue;
    
    const videoUrl = videoMatch[1];
    const serverName = videoMatch[2];
    
    // Try to find server IP near the video
    // Look for server links like /server-s123
    const serverIdMatch = tr.match(/\/server-s(\d+)/);
    
    // Look for IP pattern - the server IP is usually in an <a> or nearby text
    const ipMatch = tr.match(/([a-z0-9][-a-z0-9]*\.[a-z]{2,}(?:\.[a-z]{2,})?)(?::\d+)?/i);
    let serverIp = null;
    if (ipMatch) {
      const candidate = ipMatch[1];
      // Filter out minecraft-mp.com itself and image paths
      if (!candidate.includes('minecraft-mp') && !candidate.includes('twitter')) {
        serverIp = candidate;
      }
    }
    
    // Also look for the title/alt of the server
    const altMatch = tr.match(/alt="([^"]+)"[^>]*title="([^"]+)"/);
    
    if (videoUrl) {
      results.push({
        name: serverName,
        videoUrl: videoUrl,
        serverId: serverIdMatch ? serverIdMatch[1] : null,
        ip: serverIp,
        title: altMatch ? altMatch[2] : serverName,
      });
    }
  }
  
  return results;
}

/**
 * Alternative parsing: look for video tags directly in HTML
 */
function parseBannersDirect(html) {
  const results = [];
  
  // Pattern: <video ... src="https://minecraft-mp.com/images/banners/banner-XXXXXXX-timestamp.mp4" ... title="ServerName">
  const videoRegex = /<video[^>]*src="https:\/\/minecraft-mp\.com\/images\/banners\/banner-(\d+)-(\d+)\.mp4"[^>]*title="([^"]+)"/gi;
  let vm;
  
  while ((vm = videoRegex.exec(html)) !== null) {
    results.push({
      serverId: vm[1],
      timestamp: vm[2],
      name: vm[3],
      videoUrl: `https://minecraft-mp.com/images/banners/banner-${vm[1]}-${vm[2]}.mp4`,
    });
  }
  
  return results;
}

/**
 * Crawl server detail pages to find real IP for a minecraft-mp server ID
 */
async function getServerIPById(serverId) {
  const html = await fetchRaw(`${MP_BASE}/server-s${serverId}`);
  if (!html) return null;
  
  // IP is usually in the page title or server info
  const ipMatch = html.match(/Server IP:\s*<\/td>\s*<td[^>]*>\s*([a-z0-9][-a-z0-9.]*\.[a-z]{2,})/i);
  if (ipMatch) return ipMatch[1];
  
  // Try h2 or title
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (!titleMatch) return null;
  
  return null;
}

// ── Our server list for matching ──
function loadOurServers() {
  const jsonPath = path.join(__dirname, 'pvp-servers.json');
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

// ── Upload video to Supabase ──
async function uploadVideo(filename, buffer) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`);
    const req = https.request({
      hostname: parsed.hostname, port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.length,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        else resolve(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`);
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function updateServerBanner(ip, bannerUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${SUPABASE_URL}/rest/v1/servers?ip=eq.${encodeURIComponent(ip)}`);
    const payload = JSON.stringify({ banner: bannerUrl });
    const req = https.request({
      hostname: parsed.hostname, port: 443,
      path: parsed.pathname + parsed.search,
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Prefer: 'return=minimal',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        else resolve(res.statusCode);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function downloadVideo(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.0.0 Safari/537.36' },
      timeout: 30000,
    }, res => {
      if (res.statusCode >= 400) { resolve(null); return; }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
  });
}

async function main() {
  console.log('🎬 Scraping minecraft-mp.com for video banners\n');
  
  const ourServers = loadOurServers();
  const ourIPs = new Map(ourServers.map(s => [s.i.toLowerCase(), s]));
  
  console.log('📋 Crawling minecraft-mp.com pages...');
  
  // Pages to crawl
  const pages = [
    `${MP_BASE}/`,
    `${MP_BASE}/serverlist/`,
    `${MP_BASE}/type/pvp/`,
    `${MP_BASE}/serverlist/minepvp/`,
    `${MP_BASE}/type/survival/`,
    `${MP_BASE}/type/creative/`,
    `${MP_BASE}/type/hardcore/`,
    `${MP_BASE}/type/minigames/`,
    `${MP_BASE}/type/smp/`,
  ];
  
  // Paginate some category pages
  for (let p = 2; p <= 10; p++) {
    pages.push(`${MP_BASE}/serverlist/?page=${p}`);
    pages.push(`${MP_BASE}/type/pvp/?page=${p}`);
    pages.push(`${MP_BASE}/type/survival/?page=${p}`);
    pages.push(`${MP_BASE}/type/minigames/?page=${p}`);
  }
  
  const allBanners = [];
  const seenVideos = new Set();
  
  for (let i = 0; i < pages.length; i++) {
    const pageUrl = pages[i];
    const html = await fetchRaw(pageUrl);
    if (!html) { if (i % 20 === 0) console.log(`  ✗ ${pageUrl}`); continue; }
    
    const banners = parseBannersDirect(html);
    
    if (banners.length > 0) {
      for (const b of banners) {
        if (!seenVideos.has(b.videoUrl)) {
          seenVideos.add(b.videoUrl);
          allBanners.push(b);
          
          // Try to find IP from the same page context
          const pageBanners = parseBannersFromPage(html);
          const matchingBanner = pageBanners.find(pb => pb.serverId === b.serverId);
          if (matchingBanner && matchingBanner.ip) {
            b.ip = matchingBanner.ip;
          }
        }
      }
      
      if (i % 15 === 0) {
        console.log(`  Page ${i + 1}/${pages.length}: ${pageUrl.replace(MP_BASE, '')} → ${banners.length} banners (total: ${allBanners.length})`);
      }
    }
    
    await delay(600);
  }
  
  console.log(`\n📊 Found ${allBanners.length} unique video banners`);
  
  // Match to our servers by IP
  const matched = [];
  for (const b of allBanners) {
    if (b.ip) {
      const ourServer = ourIPs.get(b.ip.toLowerCase());
      if (ourServer) {
        matched.push({
          server: ourServer,
          ...b,
        });
      }
    }
  }
  
  console.log(`Matched to our servers: ${matched.length}`);
  if (matched.length === 0) {
    console.log('\nNo IP matches found. Trying name matching...');
    // Try by name
    for (const b of allBanners) {
      const ourServer = ourServers.find(s => 
        s.n.toLowerCase() === b.name.toLowerCase() ||
        s.n.toLowerCase().includes(b.name.toLowerCase()) ||
        b.name.toLowerCase().includes(s.n.toLowerCase())
      );
      if (ourServer) {
        matched.push({ server: ourServer, ...b });
        console.log(`  ✓ "ourServer.n" ↔ "b.name" (IP: ourServer.i)`);
      }
    }
  }
  
  console.log(`\n🎬 Matched ${matched.length} video banners to our servers`);
  
  if (matched.length === 0) {
    console.log('\nNo matches found. Will still download and show what we found:');
    // Show what we found
    for (const b of allBanners.slice(0, 20)) {
      console.log(`  📹 ${b.name} (ID: ${b.serverId})`);
      console.log(`    ${b.videoUrl}`);
    }
    return;
  }
  
  // Download and upload matched videos
  console.log('\n📤 Downloading and uploading video banners...');
  
  for (let i = 0; i < matched.length; i++) {
    const m = matched[i];
    console.log(`  ${i + 1}/${matched.length}: ${m.server.n} (${m.server.i})`);
    
    try {
      const videoBuffer = await downloadVideo(m.videoUrl);
      if (!videoBuffer || videoBuffer.length < 1000) {
        console.log(`    ✗ Download failed or too small`);
        continue;
      }
      
      const filename = `video-${m.server.i.replace(/[^a-z0-9.]/g, '-')}.mp4`;
      const url = await uploadVideo(filename, videoBuffer);
      
      // Update DB
      await updateServerBanner(m.server.i, url);
      console.log(`    ✅ ${url}`);
      
    } catch (e) {
      console.log(`    ❌ ${e.message.slice(0, 150)}`);
    }
    
    await delay(500);
  }
  
  console.log(`\n✅ Done! Updated ${matched.length} server banners with real video content`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
