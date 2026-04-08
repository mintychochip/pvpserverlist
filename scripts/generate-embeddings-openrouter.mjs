#!/usr/bin/env node
/**
 * Generate semantic embeddings for all servers
 * Uses OpenRouter API (supports many embedding models)
 * Run with: node scripts/generate-embeddings-openrouter.mjs
 */

import { createClient } from '@supabase/supabase-js';

// These should be set via environment
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM1MTAwNCwiZXhwIjoyMDkwOTI3MDA0fQ.XhD7HSa1RwnfhP5pCeHQ2dLErAPFysT2BkRF2VQVozE';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_KEY) {
  console.error('❌ Missing OPENROUTER_API_KEY');
  console.error('   Get from https://openrouter.ai/keys');
  console.error('\nUsage: OPENROUTER_API_KEY=xxx node generate-embeddings-openrouter.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// OpenRouter embedding API - uses Voyage model (768 dims)
async function generateEmbedding(text) {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://guildpost.tech',
      'X-Title': 'GuildPost'
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: text
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function processServers() {
  console.log('🔍 Fetching servers without embeddings...');
  
  const { data: servers, error } = await supabase
    .from('servers')
    .select('id, name, description, tags')
    .is('embedding', null)
    .limit(50);
  
  if (error) {
    console.error('❌ Error fetching servers:', error);
    return;
  }
  
  console.log(`📊 Found ${servers?.length || 0} servers without embeddings\n`);
  
  if (!servers || servers.length === 0) {
    console.log('✅ All servers have embeddings!');
    return;
  }
  
  let processed = 0;
  let failed = 0;
  
  for (const server of servers) {
    try {
      const text = [
        server.name,
        server.description,
        ...(server.tags || [])
      ].filter(Boolean).join('. ');
      
      if (!text || text.length < 5) {
        console.log(`⏭️  Skipping ${server.name} - no content`);
        continue;
      }
      
      console.log(`🤖 [${processed + 1}/${servers.length}] ${server.name}`);
      
      const embedding = await generateEmbedding(text);
      
      if (!embedding || embedding.length !== 768) {
        console.error(`   ❌ Wrong embedding size: ${embedding?.length}`);
        failed++;
        continue;
      }
      
      const { error: updateError } = await supabase
        .from('servers')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', server.id);
      
      if (updateError) {
        console.error(`   ❌ Failed to update:`, updateError.message);
        failed++;
      } else {
        console.log(`   ✅ Updated (dim: ${embedding.length})`);
        processed++;
      }
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (err) {
      console.error(`   ❌ Error:`, err.message);
      failed++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n🎉 Done! Processed: ${processed}, Failed: ${failed}`);
}

async function testEmbedding() {
  console.log('🧪 Testing OpenRouter embedding...');
  
  try {
    const embedding = await generateEmbedding("Minecraft PvP survival server");
    console.log(`✅ OpenRouter works! Dimensions: ${embedding.length}`);
    console.log(`   Sample: ${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...`);
  } catch (err) {
    console.error('❌ OpenRouter test failed:', err.message);
    process.exit(1);
  }
}

// Main
if (process.argv.includes('--test')) {
  testEmbedding();
} else if (process.argv.includes('--status')) {
  const { data } = await supabase.from('servers').select('id, embedding');
  const withEmb = data?.filter(s => s.embedding).length || 0;
  console.log(`📊 Status: ${withEmb}/${data?.length || 0} servers have embeddings`);
} else {
  testEmbedding().then(() => processServers());
}
