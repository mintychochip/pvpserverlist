#!/usr/bin/env node
/**
 * Generate semantic embeddings for servers using Gemini API
 * Store embeddings in Pinecone for vector search
 * Run with: node scripts/generate-embeddings-pinecone.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { Pinecone } from '@pinecone-database/pinecone';

// Environment configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JINA_API_KEY = process.env.JINA_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'guildpost';

if (!SUPABASE_SERVICE_KEY || !JINA_API_KEY || !PINECONE_API_KEY) {
  console.error('❌ Missing required env vars:');
  console.error('   SUPABASE_SERVICE_KEY - Get from Supabase dashboard');
  console.error('   JINA_API_KEY - Get from https://jina.ai/embeddings/');
  console.error('   PINECONE_API_KEY - From 1Password guildpost vault');
  console.error('\nUsage: node generate-embeddings-pinecone.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });

// Get or create Pinecone index
async function getIndex() {
  try {
    const index = pinecone.index(PINECONE_INDEX);
    // Test connection
    await index.describeIndexStats();
    return index;
  } catch (err) {
    console.log(`⚠️  Index '${PINECONE_INDEX}' not found, checking available indexes...`);
    const indexes = await pinecone.listIndexes();
    console.log('Available indexes:', indexes.map(i => i.name).join(', ') || 'none');
    
    // Try to create if missing
    console.log(`📝 Creating index '${PINECONE_INDEX}'...`);
    await pinecone.createIndex({
      name: PINECONE_INDEX,
      dimension: 768, // Jina embedding dimension
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    });
    
    // Wait for index to be ready
    console.log('⏳ Waiting for index to be ready...');
    await new Promise(r => setTimeout(r, 60000));
    
    return pinecone.index(PINECONE_INDEX);
  }
}

// Jina AI embedding API - 768 dimensions
async function generateEmbedding(text) {
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JINA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: [text]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jina API error: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const values = data.data?.[0]?.embedding;
  
  if (!values || values.length === 0) {
    throw new Error('Empty embedding returned');
  }
  
  console.log(`📐 ${values.length} dimensions`);
  return values;
}

async function processServers(index) {
  console.log('🔍 Fetching servers without Pinecone embeddings...');
  
  // Get servers that haven't been embedded yet
  // We'll check Pinecone for existing embeddings
  const { data: servers, error, count } = await supabase
    .from('servers')
    .select('id, name, description, tags, version', { count: 'exact' })
    .limit(500);
  
  if (error) {
    console.error('❌ Error fetching servers:', error);
    return;
  }
  
  console.log(`📊 Total servers in database: ${count}`);
  
  if (!servers || servers.length === 0) {
    console.log('✅ No servers to process');
    return;
  }
  
  // Check which servers already have embeddings in Pinecone
  const serverIds = servers.map(s => s.id);
  const { data: existingEmbeddings } = await supabase
    .from('server_embeddings')
    .select('server_id')
    .in('server_id', serverIds);
  
  const embeddedIds = new Set(existingEmbeddings?.map(e => e.server_id) || []);
  const serversToProcess = servers.filter(s => !embeddedIds.has(s.id));
  
  console.log(`📊 Servers already embedded: ${embeddedIds.size}`);
  console.log(`📊 Servers to process: ${serversToProcess.length}\n`);
  
  if (serversToProcess.length === 0) {
    console.log('✅ All servers have Pinecone embeddings!');
    return;
  }
  
  console.log(`📝 Processing ${serversToProcess.length} servers...\n`);
  
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const server of serversToProcess) {
    try {
      // Create rich text for embedding
      const text = [
        server.name,
        server.description,
        `Version: ${server.version || 'unknown'}`,
        ...(server.tags || [])
      ].filter(Boolean).join('. ');
      
      if (!text || text.length < 5) {
        console.log(`⏭️  Skipping ${server.id} - no content`);
        skipped++;
        continue;
      }
      
      console.log(`🤖 [${processed + failed + skipped + 1}/${serversToProcess.length}] ${server.name?.substring(0, 40)}...`);
      
      const embedding = await generateEmbedding(text);
      
      if (!embedding || embedding.length === 0) {
        console.error(`   ❌ Empty embedding returned`);
        failed++;
        continue;
      }
      
      console.log(`   📐 Dimensions: ${embedding.length}`);
      
      // Upsert to Pinecone
      await index.upsert([{
        id: server.id,
        values: embedding,
        metadata: {
          name: server.name?.substring(0, 100) || '',
          description: server.description?.substring(0, 500) || '',
          version: server.version || 'unknown',
          tags: (server.tags || []).join(',')
        }
      }]);
      
      // Mark as embedded in Supabase
      const { error: insertError } = await supabase
        .from('server_embeddings')
        .upsert({
          server_id: server.id,
          pinecone_id: server.id,
          indexed_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error(`   ⚠️  Failed to mark as embedded:`, insertError.message);
        // Don't count as failed since Pinecone upsert succeeded
      }
      
      console.log(`   ✅ Stored in Pinecone`);
      processed++;
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
      
    } catch (err) {
      console.error(`   ❌ Error:`, err.message);
      failed++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n🎉 Done! Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`);
  
  // Show final stats
  const { count: totalEmbedded } = await supabase
    .from('server_embeddings')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Total Pinecone embeddings: ${totalEmbedded}/${count}`);
}

// Test connections
async function testConnections() {
  console.log('🧪 Testing connections...\n');
  
  // Test Jina AI
  try {
    const embedding = await generateEmbedding("Minecraft PvP survival server");
    console.log(`✅ Jina AI works! Dimensions: ${embedding.length}`);
  } catch (err) {
    console.error(`❌ Jina AI failed:`, err.message);
    // Don't exit on test failure - let it fail during actual processing
  }
  
  // Test Pinecone
  try {
    const index = await getIndex();
    const stats = await index.describeIndexStats();
    console.log(`✅ Pinecone connected! Total vectors: ${stats.totalRecordCount || 0}`);
    return index;
  } catch (err) {
    console.error(`❌ Pinecone failed:`, err.message);
    throw err; // Pinecone is required - throw to stop
  }
}

// Show status
async function showStatus() {
  const { count } = await supabase
    .from('servers')
    .select('*', { count: 'exact', head: true });
  
  const { count: embeddedCount } = await supabase
    .from('server_embeddings')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Embedding status: ${embeddedCount || 0}/${count || 0} servers have Pinecone embeddings`);
  
  if (embeddedCount < count) {
    console.log(`   ${(count || 0) - (embeddedCount || 0)} servers pending`);
  }
}

// Ensure server_embeddings table exists
async function ensureTable() {
  const { error } = await supabase
    .from('server_embeddings')
    .select('*', { count: 'exact', head: true });
  
  if (error && error.message.includes('relation "server_embeddings" does not exist')) {
    console.log('⚠️  server_embeddings table not found. Run this SQL in Supabase:');
    console.log(`
CREATE TABLE IF NOT EXISTS server_embeddings (
  server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  pinecone_id TEXT NOT NULL,
  indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_embeddings_indexed_at ON server_embeddings(indexed_at);
    `);
    process.exit(1);
  }
}

// Main
async function main() {
  await ensureTable();
  
  if (process.argv.includes('--status')) {
    await showStatus();
    return;
  }
  
  const index = await testConnections();
  await processServers(index);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
