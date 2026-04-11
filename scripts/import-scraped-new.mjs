#!/usr/bin/env node
// Import scraped servers from servers_scraped_new.json to Supabase

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_KEY or SUPABASE_KEY environment variable required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Clean up server names - remove HTML and junk
function cleanName(name, ip) {
  if (!name || name === 'Minecraft Server') {
    // Generate from IP
    const domain = ip.split(':')[0];
    const parts = domain.split('.');
    let namePart = parts[0];
    if (['play', 'mc', 'top', 'tm'].includes(namePart) && parts.length > 1) {
      namePart = parts[1];
    }
    return namePart
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/mc$/i, 'MC');
  }
  
  // Clean HTML and extra whitespace
  return name
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/IP:\s*/gi, '')
    .trim()
    .substring(0, 50);
}

// Guess tags from domain/name
function guessTags(ip, name) {
  const tags = [];
  const lower = (ip + ' ' + name).toLowerCase();
  
  if (lower.includes('pvp')) tags.push('PvP');
  if (lower.includes('survival') || lower.includes('smp')) tags.push('Survival');
  if (lower.includes('skyblock')) tags.push('Skyblock');
  if (lower.includes('faction')) tags.push('Factions');
  if (lower.includes('prison')) tags.push('Prison');
  if (lower.includes('minigame')) tags.push('Minigames');
  if (lower.includes('pixelmon') || lower.includes('cobblemon')) tags.push('Pixelmon');
  if (lower.includes('creative')) tags.push('Creative');
  if (lower.includes('anarchy')) tags.push('Anarchy');
  if (lower.includes('hardcore')) tags.push('Hardcore');
  if (lower.includes('opblocks')) tags.push('Prison', 'Minigames');
  if (lower.includes('complex')) tags.push('Minigames');
  if (lower.includes('minepiece')) tags.push('Survival');
  
  if (tags.length === 0) tags.push('Multiplayer');
  return tags.slice(0, 3);
}

async function importServers() {
  console.log('🚀 Importing scraped servers to Guild Post\n');
  
  // Read the scraped data
  const filePath = join(__dirname, '..', 'servers_scraped_new.json');
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const servers = data.servers || [];
  
  console.log(`📋 Found ${servers.length} servers to import\n`);
  
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
    .map((s, index) => {
      const name = cleanName(s.name, s.ip);
      const tags = guessTags(s.ip, name);
      
      return {
        id: `scraped-new-${Date.now()}-${index}`,
        ip: s.ip,
        port: s.port || 25565,
        name: name,
        description: `${name} - Join this Minecraft server!`,
        version: s.version || '1.20+',
        tags: tags,
        edition: 'java',
        verified: false,
        vote_count: 0,
        players_online: s.players_online || 0,
        max_players: s.max_players || 100,
        status: 'unknown',
        icon: s.icon || null,
        banner: s.banner || null,
        created_at: new Date().toISOString()
      };
    });
  
  console.log(`📊 ${servers.length} total, ${newServers.length} new (skipped ${servers.length - newServers.length} duplicates)\n`);
  
  if (newServers.length === 0) {
    console.log('✅ All servers already in database!');
    return 0;
  }
  
  // Show sample of what we're importing
  console.log('📝 Sample servers to import:');
  newServers.slice(0, 5).forEach(s => {
    console.log(`  - ${s.name} (${s.ip}:${s.port}) - ${s.tags.join(', ')}`);
  });
  console.log();
  
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
  
  console.log(`\n\n🎉 DONE! Imported ${inserted} new servers into Guild Post!`);
  console.log(`📈 Database now has ${(existing?.length || 0) + inserted} total servers`);
  
  return inserted;
}

importServers().catch(err => {
  console.error('💥 Import failed:', err);
  process.exit(1);
});
