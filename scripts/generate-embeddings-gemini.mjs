#!/usr/bin/env node
/**
 * Generate semantic embeddings for all servers using Gemini API
 * Run with: node scripts/generate-embeddings-gemini.mjs
 */

import { createClient } from '@supabase/supabase-js';

// These should be set via environment or Cloudflare secrets
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
  console.error('❌ Missing required env vars:');
  console.error('   SUPABASE_SERVICE_KEY - Get from Supabase dashboard > Settings > API');
  console.error('   GEMINI_API_KEY - Get from https://aistudio.google.com/apikey');
  console.error('\nUsage: SUPABASE_SERVICE_KEY=xxx GEMINI_API_KEY=xxx node generate-embeddings-gemini.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Gemini embedding API - uses gemini-embedding-001 model
async function generateEmbedding(text) {
  const model = 'models/gemini-embedding-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${GEMINI_API_KEY}`;
  
  console.log(`   Generating embedding with ${model}...`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const values = data.embedding?.values;
  
  if (!values || values.length === 0) {
    throw new Error('Empty embedding returned');
  }
  
  return values;
}

async function processServers() {
  console.log('🔍 Fetching servers without embeddings...');
  
  const { data: servers, error, count } = await supabase
    .from('servers')
    .select('id, name, description, tags', { count: 'exact' })
    .is('embedding', null)
    .limit(100);
  
  if (error) {
    console.error('❌ Error fetching servers:', error);
    return;
  }
  
  console.log(`📊 Total servers: ${count}`);
  console.log(`📊 Servers without embeddings: ${servers?.length || 0}\n`);
  
  if (!servers || servers.length === 0) {
    console.log('✅ All servers have embeddings!');
    return;
  }
  
  console.log(`📝 Processing ${servers.length} servers...\n`);
  
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const server of servers) {
    try {
      // Create rich text for embedding
      const text = [
        server.name,
        server.description,
        ...(server.tags || [])
      ].filter(Boolean).join('. ');
      
      if (!text || text.length < 5) {
        console.log(`⏭️  Skipping ${server.id} - no content`);
        skipped++;
        continue;
      }
      
      console.log(`🤖 [${processed + failed + skipped + 1}/${servers.length}] ${server.name?.substring(0, 40)}...`);
      
      const embedding = await generateEmbedding(text);
      
      if (!embedding || embedding.length === 0) {
        console.error(`   ❌ Empty embedding returned`);
        failed++;
        continue;
      }
      
      console.log(`   📐 Dimensions: ${embedding.length}`);
      
      // Update server with embedding - store as JSON array string
      const { error: updateError } = await supabase
        .from('servers')
        .update({ embedding: embedding })
        .eq('id', server.id);
      
      if (updateError) {
        console.error(`   ❌ Failed to update:`, updateError.message);
        failed++;
      } else {
        console.log(`   ✅ Updated`);
        processed++;
      }
      
      // Rate limiting - be nice to the API
      await new Promise(r => setTimeout(r, 300));
      
    } catch (err) {
      console.error(`   ❌ Error:`, err.message);
      failed++;
      // Longer pause on error
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n🎉 Done! Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`);
  
  // Show final status
  const { data: status } = await supabase
    .from('servers')
    .select('embedding', { count: 'exact' });
  
  const withEmb = status?.filter(s => s.embedding).length || 0;
  const total = status?.length || 0;
  console.log(`📊 Total embeddings in DB: ${withEmb}/${total}`);
}

// Test embedding
async function testEmbedding() {
  console.log('🧪 Testing Gemini embedding...\n');
  
  try {
    const embedding = await generateEmbedding("Minecraft PvP survival server with factions and economy");
    console.log(`\n✅ Gemini works! Dimensions: ${embedding.length}`);
    console.log(`   Sample values: ${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...`);
    return true;
  } catch (err) {
    console.error(`\n❌ Gemini test failed:`, err.message);
    process.exit(1);
  }
}

// Show status
async function showStatus() {
  const { data, error, count } = await supabase
    .from('servers')
    .select('embedding', { count: 'exact' });
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  const withEmb = data?.filter(s => s.embedding).length || 0;
  const total = count || data?.length || 0;
  console.log(`📊 Embedding status: ${withEmb}/${total} servers have embeddings`);
  
  if (withEmb < total) {
    console.log(`   Run without --status to generate embeddings for ${total - withEmb} remaining servers`);
  }
}

// Main
if (process.argv.includes('--test')) {
  testEmbedding();
} else if (process.argv.includes('--status')) {
  showStatus();
} else {
  testEmbedding().then(() => processServers());
}