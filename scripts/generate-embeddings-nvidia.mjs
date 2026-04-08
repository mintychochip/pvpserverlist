#!/usr/bin/env node
/**
 * Generate semantic embeddings for all servers
 * Uses NVIDIA NIM API with BGE-M3 embedding model (1024 dims -> we'll truncate to 768)
 * Run with: node scripts/generate-embeddings-nvidia.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM1MTAwNCwiZXhwIjoyMDkwOTI3MDA0fQ.XhD7HSa1RwnfhP5pCeHQ2dLErAPFysT2BkRF2VQVozE';
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;

if (!NVIDIA_KEY) {
  console.error('❌ Missing NVIDIA_API_KEY');
  console.error('   Get from https://build.nvidia.com/');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// NVIDIA NIM embedding API with BGE-M3
async function generateEmbedding(text) {
  const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'baai/bge-m3',
      input: [text],
      input_type: 'query',
      encoding_format: 'float'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`NVIDIA API error: ${error}`);
  }

  const data = await response.json();
  // BGE-M3 produces 1024 dimensions, we'll use first 768
  const fullEmbedding = data.data[0].embedding;
  return fullEmbedding.slice(0, 768);
}

async function processServers() {
  console.log('🔍 Fetching servers without embeddings...');
  
  const { data: servers, error } = await supabase
    .from('servers')
    .select('id, name, description, tags')
    .is('embedding', null)
    .limit(100);
  
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
        console.log(`   ✅ Updated`);
        processed++;
      }
      
      await new Promise(r => setTimeout(r, 50));
      
    } catch (err) {
      console.error(`   ❌ Error:`, err.message);
      failed++;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log(`\n🎉 Done! Processed: ${processed}, Failed: ${failed}`);
}

async function testEmbedding() {
  console.log('🧪 Testing NVIDIA embedding...');
  
  try {
    const embedding = await generateEmbedding("Minecraft PvP survival server");
    console.log(`✅ NVIDIA works! Dimensions: ${embedding.length}`);
  } catch (err) {
    console.error('❌ NVIDIA test failed:', err.message);
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
