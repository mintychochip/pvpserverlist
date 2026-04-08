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

// Gemini embedding API - text-embedding-004 produces 768 dimensions
async function generateEmbedding(text) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT'
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.embedding?.values;
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
  
  // Check total status
  const { data: status } = await supabase
    .from('servers')
    .select('id', { count: 'exact', head: true });
  
  console.log(`📊 Total servers: ${count}`);
  console.log(`📊 Servers without embeddings: ${servers?.length || 0}\n`);
  
  if (!servers || servers.length === 0) {
    console.log('✅ All servers have embeddings!');
    return;
  }
  
  console.log(`📝 Processing ${servers.length} servers...\n`);
  
  let processed = 0;
  let failed = 0;
  
  for (const server of servers) {
    try {
      // Create rich text for embedding
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
      
      // Update server with embedding
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
      
      // Rate limiting - Gemini has limits
      await new Promise(r => setTimeout(r, 200));
      
    } catch (err) {
      console.error(`   ❌ Error:`, err.message);
      failed++;
      // Longer pause on error
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n🎉 Done! Processed: ${processed}, Failed: ${failed}`);
}

// Test embedding
async function testEmbedding() {
  console.log('🧪 Testing Gemini embedding...');
  
  try {
    const embedding = await generateEmbedding("Minecraft PvP survival server");
    console.log(`✅ Gemini works! Dimensions: ${embedding.length}`);
    console.log(`   Sample values: ${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...`);
  } catch (err) {
    console.error('❌ Gemini test failed:', err.message);
    process.exit(1);
  }
}

// Main
if (process.argv.includes('--test')) {
  testEmbedding();
} else if (process.argv.includes('--status')) {
  const { data, error } = await supabase
    .from('servers')
    .select('id, embedding', { count: 'exact' });
  
  const withEmb = data?.filter(s => s.embedding).length || 0;
  const total = data?.length || 0;
  console.log(`📊 Embedding status: ${withEmb}/${total} servers have embeddings`);
} else {
  testEmbedding().then(() => processServers());
}
