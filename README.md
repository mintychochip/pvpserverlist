# GuildPost

Minecraft server listing platform with AI-powered search, server discovery, and community features.

**Live Site:** https://guildpost.tech

## Tech Stack

- **Framework:** Astro 5.x (SSR)
- **Platform:** Cloudflare Pages
- **Database:** Supabase (PostgreSQL + pgvector)
- **Styling:** TailwindCSS
- **AI:** Gemini API (text-embedding-004) + Gemma 3 4B

## Features

### Core Platform
- Cloudflare Pages SSR with Astro
- GitHub auto-deployment
- Custom domain (guildpost.tech)
- Supabase backend with Row Level Security

### Server Discovery
- AI semantic search (natural language queries)
- Advanced filters & sorting
- Category-based navigation (18 categories)
- Real-time server status
- Pagination

### User Features
- Favorites/bookmarks
- Server comparison (up to 4 servers)
- Voting system with 24h cooldown
- Social sharing (Twitter, Discord)
- Related server recommendations

### Server Management
- Server submission form
- Votifier integration
- Image scraping tools
- Discord webhook notifications
- SEO-optimized detail pages

### AI Features
- Semantic search with embeddings
- AI search suggestions (Gemma 4B)
- Intent-based query parsing

## Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/       # Astro components (Header, ServerCards, etc.)
├── layouts/         # Page layouts
├── pages/           # Route pages
│   ├── index.astro           # Homepage
│   ├── minecraft.astro       # Server listing
│   ├── minecraft/[category].astro  # Category pages
│   ├── servers/[id].astro    # Server detail (SSR)
│   ├── compare.astro         # Server comparison
│   ├── favorites.astro       # User favorites
│   ├── submit.astro          # Server submission
│   └── api/                  # API endpoints
├── scripts/         # Utility scripts
└── supabase/        # Database migrations
functions/           # Cloudflare Functions
public/             # Static assets
docs/               # Documentation
```

## Environment Setup

### 1. Supabase
- Create project at supabase.com
- Run migrations in `supabase/migrations/`
- Enable pgvector extension for semantic search

### 2. Cloudflare
- Connect repo to Cloudflare Pages
- Set environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY` (secret)
  - `GEMINI_API_KEY` (secret)
  - `CRON_SECRET` (secret)

### 3. Deploy Worker
```bash
wrangler login
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put CRON_SECRET
wrangler deploy
```

## Key Files

| File | Purpose |
|------|---------|
| `astro.config.mjs` | Astro configuration (SSR, Cloudflare adapter) |
| `wrangler.toml` | Cloudflare Worker config, cron triggers |
| `tailwind.config.js` | TailwindCSS theme |
| `supabase/migrations/` | Database schema |
| `docs/` | Feature documentation |

## Documentation

- `AI_FEATURES.md` - AI semantic search setup
- `FEATURES_REVIEW.md` - Complete feature list
- `VOTIFIER_SETUP.md` - Votifier integration guide
- `SEMANTIC_SEARCH_SETUP.md` - Search configuration
- `README_DASHBOARD_UPDATE.md` - Dashboard features
- `docs/intent-search-design.md` - Intent search architecture

## Development Notes

- Commits must use: `mintychochip <jlo2@csub.edu>`
- Pre-commit: `git config user.name "mintychochip" && git config user.email "jlo2@csub.edu"`
- Uses `minecraft-server-util` (externalized in vite config)
- Cron job pings servers every 5 minutes

## Scripts

```bash
# Generate embeddings for existing servers
node scripts/generate-embeddings.mjs

# Scrape server images
node scripts/scrape-images.mjs

# Import scraped data
node scripts/import-scraped-servers.mjs

# Generate sitemap
node scripts/generate-sitemap.mjs
```

## License

MIT
