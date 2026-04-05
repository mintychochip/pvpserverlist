# PvP Index — Server Directory Design

## Overview

A high-performance Minecraft PvP server directory built on Vercel + Supabase. Targets competitive PvP players with real-time latency data, developer-first integrations, and a modern dark-themed UI.

Stack: Next.js (App Router) + Supabase (Postgres + Edge Functions) + SLP (Server List Ping) for Minecraft status.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│   Browser  │────▶│  Next.js     │────▶│  Supabase          │
│   (User)   │     │  (Vercel)    │     │  - Postgres        │
└─────────────┘     └──────────────┘     │  - Edge Functions  │
                           │            │  - Row Level Sec   │
                           │            └────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Minecraft   │
                    │ Servers     │
                    │ (SLP Ping)  │
                    └─────────────┘
```

**Ping flow:**
1. User visits server page → calls `/api/server/[ip]`
2. API checks `server_status` table — if `last_checked` < 10 min, return cached
3. If stale → Supabase Edge Function pings server via SLP (UDP port 25565)
4. Edge Function updates `server_status`, returns fresh data
5. On timeout (3s) or failure → return last known status

---

## Database Schema (Supabase Postgres)

### Table: `servers`

| Column        | Type         | Notes                           |
|---------------|--------------|----------------------------------|
| id            | UUID (PK)    | Default `gen_random_uuid()`      |
| ip            | TEXT         | Unique, server IP               |
| port          | INTEGER      | Default 25565                   |
| name          | TEXT         | Server display name             |
| description   | TEXT         | Long-form description           |
| version       | TEXT         | e.g., "1.8", "1.20.4"          |
| tags          | TEXT[]       | ["crystal", "pvp", "lifesteal"] |
| platform      | TEXT         | Enum: 'java', 'bedrock', 'crossplay' |
| bedrock_ip    | TEXT         | Bedrock IP if crossplay         |
| bedrock_port  | INTEGER      | Bedrock port if crossplay       |
| region        | TEXT         | Enum: 'north-america', 'europe', 'asia', 'oceania', 'south-america' |
| verified      | BOOLEAN      | Default false                   |
| votifier_key  | TEXT         | Encrypted RSA public key        |
| vote_count    | INTEGER      | Default 0                       |
| created_at    | TIMESTAMPTZ  | Default now()                   |
| updated_at    | TIMESTAMPTZ  | Default now()                   |

### Table: `server_status`

| Column        | Type         | Notes                           |
|---------------|--------------|----------------------------------|
| id            | UUID (PK)    | Default `gen_random_uuid()`      |
| server_id     | UUID (FK)    | References servers.id            |
| status        | BOOLEAN      | true = online                   |
| latency_ms    | INTEGER      | Ping in milliseconds            |
| player_count  | INTEGER      | Current players online          |
| max_players   | INTEGER      | Max capacity                    |
| motd          | TEXT         | Server description/banner        |
| last_checked  | TIMESTAMPTZ  | Default now()                   |

Unique constraint on `server_id`.

### Table: `votes`

| Column        | Type         | Notes                           |
|---------------|--------------|----------------------------------|
| id            | UUID (PK)    | Default `gen_random_uuid()`      |
| server_id     | UUID (FK)    | References servers.id           |
| visitor_ip    | TEXT         | Hashed IP for cooldown check     |
| created_at    | TIMESTAMPTZ  | Default now()                   |

24-hour vote cooldown enforced at query time:
```sql
SELECT COUNT(*) < 1 FROM votes
WHERE server_id = $1
AND visitor_ip = $2
AND created_at > now() - interval '24 hours';
```

### Table: `verification_tokens`

| Column        | Type         | Notes                           |
|---------------|--------------|----------------------------------|
| id            | UUID (PK)    | Default `gen_random_uuid()`      |
| server_id     | UUID (FK)    | References servers.id           |
| token         | TEXT         | Unique verification string      |
| motd_pattern  | TEXT         | Expected pattern in MOTD        |
| expires_at    | TIMESTAMPTZ  | Default now() + 10 minutes      |
| verified_at   | TIMESTAMPTZ  | Null until verified             |

---

## Backend: SLP Ping (Supabase Edge Function)

Written in TypeScript (Deno runtime).

**Protocol:** Minecraft Server List Ping (SLP) — UDP, port 25565 (or server's port).

**Packet flow:**
1. Handshake: `0xFE (0xFD response)` → send `0x01` with handshake payload
2. Request: `0xFE` → server responds with SLP data
3. Parse: MOTD, player count, max players, version string
4. Latency: `Date.now()` before send, `Date.now()` after recv

**Timeout:** 3 second socket timeout. On timeout → return `{ status: last_known.status, latency_ms: null }`.

**Staleness check:** Query `server_status` by `server_id`, compare `last_checked < now() - interval '10 minutes'`.

**Edge Function signature:**
```
POST /functions/v1/ping-server
Body: { ip: string, port: number }
Response: { status: boolean, latency_ms: number, player_count: number, max_players: number, motd: string }
```

---

## Frontend (Next.js App Router)

### Pages

All pages live under the `/minecraft` path for SEO. The root `/` redirects to `/minecraft`.

| Route                           | Description                              |
|---------------------------------|------------------------------------------|
| `/minecraft`                    | Home — Minecraft server list, filters, search |
| `/minecraft/servers/[ip]`       | Individual server page (real-time data)  |
| `/minecraft/submit`             | Server submission + verification flow     |
| `/minecraft/top`                | Top-ranked servers by votes               |
| `/minecraft/category/[slug]`    | Category-filtered server list            |
| `/minecraft/version/[version]`   | Version-filtered server list             |
| `/minecraft/blog`                | Blog index                               |
| `/minecraft/blog/[slug]`         | Blog post                                |
| `/api/server/[ip]`              | Server status proxy endpoint              |
| `/api/vote`                    | Vote endpoint (POST, CSRF protected)     |
| `/api/servers`                 | Server list API (paginated, filterable)   |
| `/api/v1/servers/[ip]/status`  | Public API: server status JSON           |
| `/api/v1/servers/[ip]/badge`    | Public API: SVG rank/latency badge       |

**Java/Bedrock Toggle:** Filter bar includes a Java/Bedrock toggle. Server card shows platform badge. Filterable via `?platform=java|bedrock|crossplay` query param.

### Server Card Component

```
┌─────────────────────────────────────────────────────────────┐
│ [Icon]  ServerName                      [Java]      [Ping] │
│         play.example.com                      badge:  32ms   │
│         ★ 4.2 (128 votes)                                 │
│                                                             │
│ [1.20.4] [PvP] [Lifesteal]                               │
│                                                             │
│ 124/500 players online                            [Vote]   │
└─────────────────────────────────────────────────────────────┘
```

**Platform badge** (Java / Bedrock / Cross-Play): Color-coded pill below server name.
- Java: Orange badge
- Bedrock: Green badge
- Cross-Play: Blue badge

**Ping badge colors:**
- Green: < 50ms
- Yellow: 50-150ms
- Red: > 150ms
- Gray: offline / unknown

### Filter Bar

- Search by name
- Filter by tag: Crystal PvP, UHC, Sumo, NoDebuff, Lifesteal, SMP, etc.
- Filter by version: 1.8, 1.12, 1.20.4, etc.
- Sort: Votes, Players, Latency, Newest

### Caching Strategy

- Server list pages: ISR with 60s revalidation
- Individual server pages: SSR + client-side polling every 30s
- API routes: no cache, always fresh

---

## Verification System (No-Plugin)

**Flow:**
1. Owner submits server via `/submit` form
2. Backend generates unique token (UUID), stores in `verification_tokens`
3. Owner sees: "Add `PvPIndex: {token}` to your server MOTD"
4. Backend pings server, extracts MOTD, checks for token pattern
5. If found within 10 minutes → `servers.verified = true`, token marked `verified_at`
6. If not found → token expires, owner can retry

**MOTD parsing:** SLP response includes raw MOTD text. Extract using regex `/PvPIndex:\s*([a-zA-Z0-9-]+)/`.

---

## Votifier Bridge

**Setup:**
- Owner provides their NuVotifier RSA public key in dashboard
- Key encrypted at rest using AES-256 (key stored in env var)
- "Send Test Vote" button in owner dashboard

**Vote packet:** When user votes, server sends signed JSON using owner's RSA key via NuVotifier v2 protocol.

---

## Public API (Server Owners)

**Status endpoint:**
```
GET https://api.pvpserverlist.com/v1/servers/192.168.1.1:25565/status
Response:
{
  "rank": 42,
  "name": "ExamplePvP",
  "latency_ms": 28,
  "player_count": 124,
  "max_players": 500,
  "last_checked": "2026-04-04T23:00:00Z"
}
```

**Badge endpoint:**
```
GET https://api.pvpserverlist.com/v1/servers/192.168.1.1:25565/badge
Response: SVG image (server owners can embed in their website)
```

---

## SEO Strategy

### Domain Architecture: Subdomain Strategy

To establish clear topical authority with search engines, the site uses a **subdomain-first architecture**:

```
minecraft.pvpserverlist.gg   → Minecraft server directory (primary, Phase 1)
                                (also reachable at pvpserverlist.gg/minecraft)
rust.pvpserverlist.gg         → Rust server directory (Phase 2)
ark.pvpserverlist.gg          → ARK server directory (Phase 2)
www.pvpserverlist.gg          → Root domain redirects to minecraft.pvpserverlist.gg
```

**Why subdomain over subdirectory:**
- Google treats subdomains as **separate sites** for ranking purposes — perfect for multi-game topical authority
- minecraft.pvpserverlist.gg signals "this is a Minecraft expert site" to search engines
- Each game gets its own crawl budget, ranking signals, and domain authority
- Brand remains unified under pvpserverlist.gg
- Future games (Rust, ARK) get their own subdomains without diluting Minecraft authority

**Implementation:**
- Vercel: Configure subdomain in DNS + Vercel dashboard
- Next.js: All routes live under the root app (`/`) — Vercel routes subdomain traffic to the same app
- Supabase: Shared database across all subdomains (same project)
- Cookie/domain policy: Set `domain=.pvpserverlist.gg` for cross-subdomain voting

**Current phase (Phase 1):** Build at root or `/minecraft` path first. Subdomain migration happens at deploy time — the code doesn't change, only DNS + Vercel routing.

### SEO: Topical Authority Signals

Each Minecraft subdomain page reinforces "Minecraft expert" signals:
- Title: always starts with "Minecraft" or "Minecraft PvP"
- H1: game-specific ("Best Minecraft PvP Servers 2026")
- Version badges prominently displayed (1.8, 1.21, etc.)
- Java/Bedrock toggle filter
- Breadcrumb: Home > Minecraft > [Category]
- Internal links to other Minecraft-relevant content only (no cross-game dilution)

### 10 High-Intent PvP Keywords

1. `Crystal PvP servers 1.20.4`
2. `Lunar PvP practice server`
3. `NoDebuff PvP servers`
4. `UHC PvP servers`
5. `Hunger Games PvP servers`
6. `Bridge PvP servers`
7. `Sumo PvP servers`
8. `Practice PvP servers 1.8`
9. `1.8 PvP servers no lag`
10. `Lifesteal PvP servers`

### Category Pages

Each keyword maps to a `/category/[slug]` page:
- `/category/crystal-pvp`
- `/category/uhc-pvp`
- `/category/sumo-pvp`
- `/category/lifesteal`
- `/category/nodepuff-pvp`
- `/category/hunger-games-pvp`
- `/category/bridge-pvp`
- `/category/practice-pvp`

Server owners select tags at submission. Tag → slug mapping generates category pages automatically.

### Programmatic SEO (The "Long-Tail Net")

Auto-generate pages for every combination of filters — capturing AI-driven search traffic that big sites miss.

**URL Structure:**
```
/minecraft/version/{version}/{tag}/{region}
/minecraft/tag/{tag}/{variant}
/minecraft/version/{version}/tag/{tag}
```

**Examples:**
- `/minecraft/version/1.21.1/lifesteal/europe`
- `/minecraft/version/1.8/tag/nodepuff`
- `/minecraft/tag/crystal-pvp/low-ping`
- `/minecraft/version/1.20.4/tag/survival/north-america`

**Dimension combinations:**
- **Version**: 1.8, 1.12, 1.16, 1.18, 1.19, 1.20.4, 1.21, 1.21.1
- **Tag**: crystal-pvp, uhc-pvp, sumo, nodepuff, lifesteal, smp, practice, bridge, hunger-games, prison
- **Region**: north-america, europe, asia, oceania, south-america (based on server latency)
- **Variant**: low-ping (<50ms), medium-ping (<150ms), no-lag, p2w, no-p2w

**Implementation:**
- `src/app/minecraft/version/[version]/[tag]/[region]/page.tsx` — dynamic route with metadata
- `src/app/minecraft/tag/[tag]/[variant]/page.tsx` — tag + variant combo
- Query param → slug mapping generates pages dynamically at request time (SSG would be thousands of pages)
- Each page has unique metadata: `<title>Minecraft 1.21.1 Lifesteal Servers (Europe) | PvP Index</title>`
- Each page links to: category page, version page, server list filtered by those params

**Why this wins in 2026:**
AI-driven search (SGE, Perplexity) favors the most specific result. If someone asks for "Low lag 1.21.1 survival server in London," your site has a page matching that exact data point. Generic lists never optimize for these combinations.

**Page count:** With 8 versions × 10 tags × 5 regions = 400 combinations, plus variants = 1000+ potential pages, all generated from the same route templates.

### JSON-LD Schema

**Homepage (minecraft.pvpserverlist.gg):**
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Best Minecraft PvP Servers 2026",
  "description": "Top-ranked Minecraft PvP servers with real-time latency, player counts, and version filters. Find Crystal PvP, UHC, Sumo, NoDebuff, and more.",
  "url": "https://minecraft.pvpserverlist.gg",
  "about": {
    "@type": "Thing",
    "name": "Minecraft PvP Gaming"
  },
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "SoftwareApplication",
        "name": "ServerName",
        "applicationCategory": "GameServer",
        "applicationSubCategory": "PvPServer",
        "operatingSystem": "Minecraft 1.20.4",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.8",
          "ratingCount": "1240",
          "bestRating": "5"
        }
      }
    }
  ]
}
```

**Individual server page:** SoftwareApplication schema with server IP, version, player count, and potentialAction for "Vote" interaction.

### Blog (Top-of-Funnel Content)

- "Top 10 Crystal PvP Servers [Year]" — listicle
- "1.8 vs 1.20 PvP: Which Version is Actually Better?" — comparison
- "How to Join a PvP Server (Step-by-Step Guide)" — informational
- "Best Lifesteal Servers for Competitive Players" — category promotion
- "PvP Terminology Guide: Gapple, NoDebuff, Crystal, Sumo Explained" — glossary

Each post links to relevant category pages and server listings.

---

## Security

- **CSRF protection** on vote endpoint (same-site cookie + token)
- **Rate limiting** on vote API (1 vote per IP per 24h, enforced server-side)
- **Votifier key encryption** (AES-256, env-var stored key)
- **RLS (Row Level Security)** in Supabase for vote table
- **IP hashing** for visitor IPs in votes table (privacy)

---

## Performance Targets

- Lighthouse Performance: > 90
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Supabase Edge Function timeout: 10s max

---

## Tech Stack

| Layer           | Technology                        |
|-----------------|-----------------------------------|
| Frontend        | Next.js 15 (App Router)           |
| Hosting         | Vercel                            |
| Database        | Supabase Postgres                 |
| Ping Worker     | Supabase Edge Functions (Deno)    |
| Auth            | Supabase Auth (for owner accounts)|
| CSS             | Tailwind CSS (dark theme)          |
| Icons           | Lucide React                      |
| Fonts           | Inter (Google Fonts)              |
