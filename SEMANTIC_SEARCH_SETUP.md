# Semantic Search Setup Guide

## Bugs Fixed (2026-04-07)

### 1. Embedding Dimension Mismatch
- Original migration used `vector(768)` but Gemini produces 3072-dimensional embeddings
- Fix migration: `supabase/migrations/20260407220000_fix_semantic_search.sql`

### 2. API Routes Not Working
- `_routes.json` was catching all routes in Astro SSR
- Fixed: exclude `/api/*` from Astro routing
- Fixed: path matching in `functions/api/[[path]].js` (was `/search/semantic`, should be `/api/search/semantic`)

## Required Setup (One-time)

### 1. Set Cloudflare Secrets

The GEMINI_API_KEY is already set. Need to add SUPABASE_SERVICE_KEY:

```bash
cd /home/justin-lo/.openclaw/workspace-guildpost/repo
wrangler secret put SUPABASE_SERVICE_KEY
# Paste the Supabase service_role key from:
# https://supabase.com/dashboard/project/wpxutsdbiampnxfgkjwq/settings/api
```

### 2. Run Database Migration

Go to Supabase SQL Editor and run the contents of:
`supabase/migrations/20260407220000_fix_semantic_search.sql`

Or use Supabase CLI:
```bash
supabase db push
```

### 3. Generate Embeddings

After setting secrets and running migration:

```bash
# Get keys from 1Password or Supabase dashboard
export SUPABASE_SERVICE_KEY="<from-supabase-dashboard>"
export GEMINI_API_KEY="<from-https://aistudio.google.com/apikey>"

cd scripts
node generate-embeddings-gemini.mjs --test  # Test connection
node generate-embeddings-gemini.mjs          # Generate embeddings
```

### 4. Deploy

The fixes will auto-deploy when PR is merged, but secrets need to be set first.

```bash
# Deploy to test the fix
cd /home/justin-lo/.openclaw/workspace-guildpost/repo
wrangler pages deploy dist --project-name=guildpost
```

## Verification

After deployment, test:

```bash
curl -X POST https://guildpost.tech/api/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query": "pvp factions server", "limit": 5}'
```

Expected response:
```json
{
  "query": "pvp factions server",
  "results": [...],
  "count": 5,
  "semantic": true
}
```

If you see `{"error": "GEMINI_API_KEY not configured"}` - secrets not set.
If you see `{"error": "relation \"match_servers\" does not exist"}` - migration not run.
If you see `{"results": [], "count": 0}` - embeddings not generated.
