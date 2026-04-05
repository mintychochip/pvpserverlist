# PvP Index

Real-time Minecraft PvP server directory. Live latency checks, player counts, and community votes — ranked by performance.

**Live:** [pvp-directory.vercel.app](https://pvp-directory.vercel.app) (custom domain: pvpserverlist.gg — coming soon)

## Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend:** Vercel (serverless), Supabase Edge Functions (Deno)
- **Database:** Supabase Postgres with RLS
- **Watcher:** Node.js cron (runs on Oracle VM) — pings servers every 5 min via SLP protocol

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `SECRET_KEY` | Supabase service role key (server-only) |

## Database

Schema and migrations live in `supabase/migrations/`. The `servers` table holds listings; `server_status` holds live ping data.

## Watcher

The `watcher/` directory is a standalone Node.js cron that polls all servers every 5 minutes and updates `server_status` in Supabase. See `watcher/README.md` for setup.

## API Routes

| Route | Description |
|---|---|
| `GET /api/servers` | Paginated server list with filters |
| `GET /api/server/[ip]` | Single server with staleness-aware refresh |
| `POST /api/vote` | Submit a vote for a server |
| `GET /api/v1/servers/[ip]/status` | SVG status badge |
| `GET /api/v1/servers/[ip]/badge` | SVG latency badge |
| `POST /api/submit` | Submit a new server listing |

## SEO

- JSON-LD schema (ItemList, SoftwareApplication) on all listing pages
- Subdomain strategy: `minecraft.pvpserverlist.gg` → Minecraft topical authority
- Programmatic SEO pages: `/minecraft/version/[version]/[tag]/[region]`
