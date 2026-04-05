# Verified Live Count — Fake Player Count Detection

## Context

Players click on servers showing "450/500 Online" only to find empty lobbies. Servers use bots to inflate their numbers, destroying trust in the directory. We need a system that:
- Pings servers and tracks real player counts over time
- Compares self-reported counts (MOTD) vs our observed counts
- Displays credibility scores and flags suspicious servers

## Design

### Core Concept
Like a stock chart for server credibility — track server's self-reported counts vs our observed counts over time. Servers that consistently inflate numbers get flagged.

### Data Model

**New table: `player_count_history`**
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `server_id` | UUID | FK to servers |
| `observed_count` | INTEGER | What we measured via SLP |
| `self_reported_count` | INTEGER | What server claimed in MOTD |
| `created_at` | TIMESTAMPTZ | Timestamp of check |

**Spoofing logic per server:**
- Calculate `spoofing_score` (0-100): percentage of checks where self-reported matched observed (±10% tolerance)
- Flag server if:
  - Score < 70 over last 20 checks, OR
  - ANY check shows self-reported >500 but observed <50 (egregious spoofing)

**Columns added to `servers` table:**
| Column | Type | Description |
|--------|------|-------------|
| `spoofing_flag` | BOOLEAN | True if server is flagged |
| `spoofing_score` | INTEGER | 0-100 credibility score |

**Note:** We already store `self_reported_count` in MOTD parsing - the watcher returns `player_count` which is self-reported. We need to ensure the watcher also captures both:
- `observed_count` = what we measured independently via SLP handshake response
- `self_reported_count` = what the server's MOTD JSON contained

Actually looking at the watcher code, it only returns one count (the server's self-report via MOTD). We may need to instrument the ping to detect if the count seems inflated - perhaps by checking if max_players is suspiciously round (e.g., exactly 1000 or 6969).

### UI Changes

**ServerCard:**
- Green "Verified Live" badge if score ≥ 70 and recent checks accurate
- Amber "⚠️ Warning" flag if score < 70 or egregious discrepancy
- Mini sparkline showing last 24h of player count (our observed)

**Server detail page:**
- Full interactive chart: 24h / 7d / 30d / All-time toggle
- Overlay showing our count vs self-reported count
- Credibility score displayed prominently

### API Changes

**New endpoint: `GET /api/v1/servers/[ip]/history`**
- Returns player count history for charting
- Query params: `range=24h|7d|30d|all`
- Response: `{ server_id, data: [{ timestamp, observed_count, self_reported_count }] }`

**Updated watcher cron:**
- After each ping, insert into `player_count_history`
- Calculate running spoofing_score
- Update `spoofing_flag` and `spoofing_score` on servers table

## Implementation Order

1. Add database migration for `player_count_history` table and new server columns
2. Update watcher to record history on each ping
3. Create `/api/v1/servers/[ip]/history` endpoint
4. Add UI badges and sparkline to ServerCard
5. Add chart to server detail page

## Files to Create/Modify

- `supabase/migrations/017_player_count_history.sql`
- `src/app/api/cron/watcher/route.ts` — record history
- `src/app/api/v1/servers/[ip]/history/route.ts` — new endpoint
- `src/components/server/ServerCard.tsx` — add badges + sparkline
- `src/app/servers/[id]/page.tsx` — add chart
