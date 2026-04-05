#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM1MTAwNCwiZXhwIjoyMDkwOTI3MDA0fQ.XhD7HSa1RwnfhP5pCeHQ2dLErAPFysT2BkRF2VQVozE';
const BUCKET = 'banners';
const MP = 'https://minecraft-mp.com';

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchHTML(url, retries = 2) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36' }, timeout: 15000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400 && retries > 0) return delay(1000).then(() => resolve(fetchHTML(url, retries - 1)));
        if (res.statusCode >= 400) return resolve(null);
        resolve(d);
      });
    }).on('error', () => { if (retries > 0) delay(1000).then(() => resolve(fetchHTML(url, retries - 1))); else resolve(null); });
  });
}

async function getIP(serverId) {
  const html = await fetchHTML(`${MP}/server-s${serverId}`);
  if (!html) return null;
  // Server IP is typically in a table row
  const m = html.match(/Server IP[\s\S]{0,300}?>([a-z0-9][-a-z0-9]*(?:\.[a-z]{2,})+)\s*</i);
  if (m && !m[1].includes('minecraft-mp')) return m[1];
  return null;
}

async function downloadVideo(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 }, res => {
      if (res.statusCode >= 400) return resolve(null);
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
  });
}

async function uploadVideo(filename, buffer) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`);
    const req = https.request({ hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'video/mp4', 'Content-Length': buffer.length }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { if (res.statusCode >= 400) reject(new Error(d.slice(0,200))); else resolve(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`); }); });
    req.on('error', reject); req.write(buffer); req.end();
  });
}

async function updateBanner(ip, url) {
  return new Promise((resolve, reject) => {
    const p = new URL(`${SUPABASE_URL}/rest/v1/servers?ip=eq.${encodeURIComponent(ip)}`);
    const payload = JSON.stringify({ banner: url });
    const req = https.request({ hostname: p.hostname, port: 443, path: p.pathname + p.search, method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Prefer: 'return=minimal' }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { if (res.statusCode >= 400) reject(new Error(d.slice(0,200))); else resolve(); }); });
    req.on('error', reject); req.write(payload); req.end();
  });
}

async function main() {
  const ourServers = JSON.parse(fs.readFileSync(path.join(__dirname, 'pvp-servers.json'), 'utf-8'));
  const ourIPs = new Map(ourServers.map(s => [s.i.toLowerCase(), s]));

  console.log('🎬 Scraping video banners from minecraft-mp.com\n');
  
  // Crawl pages and collect video banners
  const pages = [`${MP}/`, `${MP}/serverlist/`, `${MP}/type/pvp/`, `${MP}/type/survival/`, `${MP}/type/minigames/`, `${MP}/type/hcf/`, `${MP}/type/bedwars/`, `${MP}/type/skyblock/`, `${MP}/type/prison/`, `${MP}/type/smp/`, `${MP}/type/factions/`, `${MP}/type/hardcore/`];
  for (let p = 2; p <= 20; p++) {
    pages.push(`${MP}/serverlist/?page=${p}`);
    pages.push(`${MP}/type/pvp/?page=${p}`);
    pages.push(`${MP}/type/survival/?page=${p}`);
  }
  
  const banners = [];
  const seenIds = new Set();
  
  for (let i = 0; i < pages.length; i++) {
    const html = await fetchHTML(pages[i]);
    if (!html) continue;
    
    for (const m of html.matchAll(/banner-(\d+)-(\d+)\.mp4"[^>]*title="([^"]+)"/gi)) {
      if (!seenIds.has(m[1])) {
        seenIds.add(m[1]);
        banners.push({ id: m[1], ts: m[2], name: m[3], videoUrl: `https://minecraft-mp.com/images/banners/banner-${m[1]}-${m[2]}.mp4`, ip: null });
      }
    }
    if (i % 25 === 0) console.log(`  Page ${i+1}/${pages.length}: ${seenIds.size} banners found`);
    await delay(500);
  }
  
  console.log(`\n🔍 Resolving IPs for ${banners.length} banners...\n`);
  
  for (let i = 0; i < banners.length; i++) {
    const ip = await getIP(banners[i].id);
    banners[i].ip = ip;
    if (ip && (i === 0 || i % 10 === 0)) console.log(`  ${i+1}/${banners.length}: ${banners[i].name} → ${ip}`);
    if ((ip && i > 0) || (!ip && i % 5 === 0)) { /* keep going */ }
    await delay(300);
  }
  
  // Match to our servers
  const matched = [];
  for (const b of banners) {
    if (b.ip) {
      const s = ourIPs.get(b.ip.toLowerCase());
      if (s) { matched.push({ server: s, ...b }); continue; }
    }
    // Fuzzy name match
    for (const s of ourServers) {
      const n1 = s.n.toLowerCase().replace(/[^a-z0-9]/g, '');
      const n2 = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) {
        matched.push({ server: s, ...b, matchType: 'name' });
        break;
      }
    }
  }
  
  console.log(`\n✅ Matched ${matched.length}/${banners.length} to our servers\n`);
  
  if (matched.length === 0) {
    console.log('No matches. Showing found servers:');
    banners.filter(b => b.ip).forEach(b => console.log(`  ${b.name} → ${b.ip} (${b.videoUrl})`));
    return;
  }
  
  // Download, upload, and update
  let done = 0;
  for (const m of matched) {
    console.log(`  ${done+1}/${matched.length}: ${m.server.n} (${m.server.i})`);
    try {
      const buf = await downloadVideo(m.videoUrl);
      if (!buf || buf.length < 1000) { console.log(`    ✗ Download failed`); continue; }
      const fn = `video-${m.server.i.replace(/[^a-z0-9.]/g, '-')}.mp4`;
      const url = await uploadVideo(fn, buf);
      await updateBanner(m.server.i, url);
      console.log(`    ✅ Done`);
      done++;
    } catch (e) { console.log(`    ❌ ${e.message.slice(0, 120)}`); }
    await delay(600);
  }
  
  console.log(`\n🎬 Updated ${done} video banners`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });