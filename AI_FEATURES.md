# 🤖 AI-Powered Features Setup Guide

This guide explains how to set up the AI semantic search and click tracking features for GuildPost.

## Features

1. **AI Semantic Search** - Users can search by describing what they want (e.g., "pvp factions with economy")
2. **Click Tracking Analytics** - Track which servers are being viewed/clicked
3. **Trending Servers** - Real-time popular servers based on click data
4. **AI Search Suggestions** - Smart autocomplete powered by LLM

## Architecture

- **Frontend**: Astro pages with JavaScript for AI toggle and click tracking
- **Backend**: Cloudflare Workers with AI binding (free tier)
- **Database**: Supabase with pgvector extension for embeddings
- **Analytics**: Cloudflare KV for real-time click tracking

## Setup Steps

### 1. Enable pgvector in Supabase

Run the SQL in `supabase/migrations/003_semantic_search.sql`:

```bash
# Connect to Supabase and run:
psql $SUPABASE_URL -f supabase/migrations/003_semantic_search.sql
```

Or run in Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
-- ... (see full SQL in file)
```

### 2. Deploy Cloudflare Worker

```bash
# Install wrangler if not already installed
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace for analytics
wrangler kv:namespace create "CLICK_ANALYTICS"

# Update wrangler.toml with the KV ID
# Edit wrangler.toml and replace "your_kv_namespace_id"

# Set secrets
wrangler secret put SUPABASE_SERVICE_KEY
# (Enter your Supabase service_role key)

# Deploy the worker
wrangler deploy
```

### 3. Generate Embeddings for Existing Servers

```bash
# Install dependencies
cd scripts
npm install @supabase/supabase-js

# Run embedding generation (requires deployed worker)
node generate-embeddings.mjs

# Or test if worker is working first
node generate-embeddings.mjs --test
```

**Note**: This will use the Cloudflare Workers AI (free tier) to generate 768-dimensional embeddings for each server based on:
- Server name
- Description
- Tags

### 4. Configure Frontend

The frontend is already updated. The AI search toggle will automatically appear on the minecraft page.

**API Endpoints**:
- `POST /api/search/semantic` - AI semantic search
- `POST /api/track/click` - Track user clicks
- `GET /api/analytics/popular` - Get trending servers
- `GET /api/search/suggestions` - AI search suggestions

## Usage

### For Users

1. Go to `/minecraft` page
2. Click the "AI: Off" button to toggle AI search
3. Type natural language queries like:
   - "pvp factions server with economy"
   - "chill survival smp for building"
   - "competitive bedwars with tournaments"

### For Analytics

View trending servers in the last 24 hours:
```javascript
fetch('/api/analytics/popular')
  .then(r => r.json())
  .then(data => console.log(data.servers));
```

## How It Works

### Semantic Search

1. User enters natural language query
2. Worker generates embedding using `@cf/baai/bge-base-en-v1.5` model
3. Searches Supabase using pgvector cosine similarity
4. Returns servers ranked by semantic relevance

### Click Tracking

1. JavaScript tracks clicks on server cards
2. Sends data to Worker API
3. Stored in KV with hourly aggregation
4. Popular servers calculated in real-time

## Free Tier Limits

**Cloudflare Workers AI**:
- 100,000 requests/day
- 50,000 AI inference calls/day (more than enough)

**Cloudflare KV**:
- 100,000 reads/day
- 1,000 writes/day
- 1,000 deletes/day
- 1GB storage

## Troubleshooting

### Embeddings not generating
- Check Worker is deployed and accessible
- Verify SUPABASE_SERVICE_KEY is set correctly
- Check pgvector extension is enabled

### AI search not working
- Verify AI binding in wrangler.toml
- Check browser console for errors
- Ensure worker URL is correct in frontend

### Click tracking not recording
- Check KV namespace binding
- Verify CORS headers in worker
- Check browser network tab for failed requests

## Next Steps

1. **Train custom embeddings** - Fine-tune on Minecraft-specific language
2. **Add recommendation engine** - "Servers like this" based on embeddings
3. **Click heatmaps** - Visualize where users click most
4. **A/B testing** - Test different layouts with analytics

## API Reference

### POST /api/search/semantic
```json
{
  "query": "pvp factions server",
  "limit": 10
}
```

Response:
```json
{
  "query": "pvp factions server",
  "results": [...],
  "count": 10,
  "semantic": true
}
```

### POST /api/track/click
```json
{
  "server_id": "uuid",
  "type": "click",
  "source": "listing"
}
```

### GET /api/analytics/popular
Response:
```json
{
  "servers": [
    {"server_id": "uuid", "clicks": 45},
    ...
  ],
  "date": "2026-04-06"
}
```

---

**Note**: AI features require Cloudflare Workers Paid Plan OR use Workers AI free tier with limits. Regular search still works without AI enabled.
