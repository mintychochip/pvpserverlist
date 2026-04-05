# Verified Live Count Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement fake player count detection system - track player count history, calculate credibility scores, display verified/warning badges on servers.

**Architecture:** Store all ping results in `player_count_history` table. After each watcher ping, calculate running spoofing_score. Display badges on ServerCard and interactive chart on server detail page.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres, Recharts for charting, existing SLP ping infrastructure.

---

## File Map

```
supabase/migrations/017_player_count_history.sql  (new)
src/app/api/cron/watcher/route.ts                 (modify - record history)
src/app/api/v1/servers/[ip]/history/route.ts      (new - serve history data)
src/components/server/ServerCard.tsx               (modify - add badges/sparkline)
src/components/server/PlayerCountChart.tsx         (new - chart component)
src/app/servers/[id]/page.tsx                     (modify - add chart section)
```

---

## Chunk 1: Database Migration

### Files:
- Create: `supabase/migrations/017_player_count_history.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Player count history table
CREATE TABLE player_count_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  observed_count INTEGER NOT NULL DEFAULT 0,
  self_reported_count INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient time-range queries
CREATE INDEX idx_player_count_history_server_id ON player_count_history(server_id);
CREATE INDEX idx_player_count_history_created_at ON player_count_history(created_at);
CREATE INDEX idx_player_count_history_server_created ON player_count_history(server_id, created_at DESC);

-- Add spoofing columns to servers table
ALTER TABLE servers ADD COLUMN IF NOT EXISTS spoofing_flag BOOLEAN DEFAULT false;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS spoofing_score INTEGER DEFAULT 100;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS spoofing_check_count INTEGER DEFAULT 0;

-- RLS for player_count_history
ALTER TABLE player_count_history ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read player_count_history" ON player_count_history FOR SELECT USING (true);

-- Service role can insert (for watcher)
CREATE POLICY "Service insert player_count_history" ON player_count_history FOR INSERT WITH CHECK (true);
```

- [ ] **Step 2: Run migration**

Apply to Supabase:
```bash
# Using Supabase CLI
supabase db push

# OR manually run in Supabase SQL editor
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_player_count_history.sql
git commit -m "feat: add player_count_history table and spoofing columns"
```

---

## Chunk 2: Update Watcher to Record History

### Files:
- Modify: `src/app/api/cron/watcher/route.ts`

- [ ] **Step 1: Read current watcher code**

See `src/app/api/cron/watcher/route.ts` lines 82-102 for `upsertServerStatus` function.

- [ ] **Step 2: Add history insert function after upsertServerStatus**

Add this new function after `upsertServerStatus` (around line 102):

```typescript
async function insertPlayerCountHistory(
  supabase: any,
  serverId: string,
  observedCount: number,
  selfReportedCount: number,
  maxPlayers: number
): Promise<void> {
  await supabase.from("player_count_history").insert({
    server_id: serverId,
    observed_count: observedCount,
    self_reported_count: selfReportedCount,
    max_players: maxPlayers,
  });
}
```

- [ ] **Step 3: Update the ping result handling**

In the watcher loop (around lines 189-199), after `upsertServerStatus`, add history insert:

```typescript
// After upsertServerStatus call, insert history
await insertPlayerCountHistory(
  supabase,
  server.id,
  result.status ? result.player_count : 0,  // observed = 0 if offline
  result.status ? result.player_count : 0,  // self-reported = 0 if offline (server didn't respond)
  result.max_players
).catch((err) => {
  errors.push(`Failed to insert history for ${server.name}: ${err}`);
});
```

Wait - the watcher currently only gets one count (server's self-report via MOTD). For true spoofing detection, we need TWO counts:
1. What the server claims in MOTD
2. What we observe independently

The SLP protocol gives us only the server's self-reported count. A true "independent observer" would require a different approach (like having players connect through our proxy). For now, we'll use a proxy for detection:

**Heuristic:** If a server's `max_players` is suspiciously round (1000, 5000, 10000) but their observed count is low, flag it. This is a simpler but effective approach.

Update the upsert call to include heuristic-based self-reported count tracking. Actually, looking at the code, `result.player_count` is already the server's self-reported count. We can't get an "independent" count via SLP - we'd need actual players connected.

For v1, let's use this approach:
- Track all pings in history
- Flag if: max_players is suspiciously round AND observed count is < 10% of max
- This catches "fake 1000/1000 online" when server shows 5 players

- [ ] **Step 4: Add spoofing detection logic**

Add a new function after `insertPlayerCountHistory`:

```typescript
async function updateSpoofingScore(
  supabase: any,
  serverId: string
): Promise<{ flag: boolean; score: number }> {
  // Get last 20 checks
  const { data: history } = await supabase
    .from("player_count_history")
    .select("observed_count, self_reported_count, max_players, created_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!history || history.length < 3) {
    return { flag: false, score: 100 }; // Not enough data
  }

  // Calculate spoofing indicators
  let suspiciousCount = 0;
  let totalChecks = history.length;

  for (const check of history) {
    // Heuristic: max_players suspiciously round (1000, 5000, 10000) + low observed
    const isSuspiciousMax = [1000, 5000, 10000, 6969].includes(check.max_players);
    const isLowCount = check.observed_count < 10 && check.self_reported_count > 100;

    // Also flag if self-reported is >10x observed consistently
    if (check.self_reported_count > check.observed_count * 10 && check.observed_count < 50) {
      suspiciousCount++;
    }

    if (isSuspiciousMax && isLowCount) {
      suspiciousCount++;
    }
  }

  const score = Math.round(((totalChecks - suspiciousCount) / totalChecks) * 100);
  const flag = score < 70 || suspiciousCount >= 3;

  return { flag, score };
}
```

- [ ] **Step 5: Call spoofing update after upsert**

In the watcher loop after inserting history, add:

```typescript
// Update spoofing score
const { flag, score } = await updateSpoofingScore(supabase, server.id);
await supabase
  .from("servers")
  .update({
    spoofing_flag: flag,
    spoofing_score: score,
    spoofing_check_count: supabase.rpc('increment', { x: 1 }) // or increment manually
  })
  .eq("id", server.id);
```

Actually Supabase doesn't have a built-in increment. Use direct update:

```typescript
const { data: current } = await supabase
  .from("servers")
  .select("spoofing_check_count")
  .eq("id", server.id)
  .single();

await supabase
  .from("servers")
  .update({
    spoofing_flag: flag,
    spoofing_score: score,
    spoofing_check_count: (current?.spoofing_check_count ?? 0) + 1
  })
  .eq("id", server.id);
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/watcher/route.ts
git commit -m "feat: record player count history and calculate spoofing scores"
```

---

## Chunk 3: History API Endpoint

### Files:
- Create: `src/app/api/v1/servers/[ip]/history/route.ts`

- [ ] **Step 1: Create the history endpoint**

```typescript
// src/app/api/v1/servers/[ip]/history/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const { ip } = await params;
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "24h";

  // Parse IP and port
  let serverIp = ip;
  let port = 25565;
  if (ip.includes(":")) {
    const [parsedIp, parsedPort] = ip.split(":");
    serverIp = parsedIp;
    port = parseInt(parsedPort);
  }

  // Calculate time range
  let since: Date;
  switch (range) {
    case "7d":
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      since = new Date(0); // Beginning of time
      break;
    case "24h":
    default:
      since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
  }

  const supabase = createAdminClient();

  // Get server by IP
  const { data: server } = await supabase
    .from("servers")
    .select("id, spoofing_flag, spoofing_score")
    .eq("ip", serverIp)
    .maybeSingle();

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  // Get history
  const { data: history } = await supabase
    .from("player_count_history")
    .select("observed_count, self_reported_count, max_players, created_at")
    .eq("server_id", server.id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  return NextResponse.json({
    server_id: server.id,
    spoofing_flag: server.spoofing_flag,
    spoofing_score: server.spoofing_score,
    range,
    data: history ?? [],
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/v1/servers/[ip]/history/route.ts
git commit -m "feat: add player count history API endpoint"
```

---

## Chunk 4: ServerCard Badges and Sparkline

### Files:
- Modify: `src/components/server/ServerCard.tsx`
- Create: `src/components/server/MiniSparkline.tsx`

- [ ] **Step 1: Create MiniSparkline component**

```typescript
// src/components/server/MiniSparkline.tsx

"use client";

interface MiniSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function MiniSparkline({
  data,
  color = "rgb(34, 197, 94)", // green-500
  width = 60,
  height = 20,
}: MiniSparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Update ServerCard interface**

Add `spoofing_flag`, `spoofing_score` to ServerCardProps interface:

```typescript
interface ServerCardProps {
  server: {
    // ... existing fields
    spoofing_flag?: boolean;
    spoofing_score?: number;
    // ... add after server_status
  };
  // ... existing
}
```

Actually ServerCard receives `server` from the parent page, so we need to also pass history data for the sparkline. Let's add optional `history` prop:

```typescript
interface ServerCardProps {
  server: {
    // ... existing
  };
  historyData?: number[]; // Array of observed_count for sparkline
  onVote?: (serverId: string) => void;
}
```

- [ ] **Step 3: Update ServerCard to show badges**

In the name row (around line 116-123), add spoofing badges:

```typescript
<h3 className="font-semibold text-white flex items-center gap-2">
  {server.name}
  {server.verified && (
    <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
      Verified
    </span>
  )}
  {server.spoofing_flag && (
    <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded flex items-center gap-1" title="Player count may be inflated">
      ⚠️ Warning
    </span>
  )}
  {!server.spoofing_flag && server.spoofing_score !== undefined && server.spoofing_score >= 70 && (
    <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1">
      ✓ Verified Live
    </span>
  )}
</h3>
```

- [ ] **Step 4: Add sparkline to player count display**

In the player count section (around line 164), add sparkline:

```typescript
<div className="text-sm">
  {isOnline ? (
    <span className="text-green-400 flex items-center gap-2">
      {player_count}/{max_players} online
      {historyData && historyData.length > 1 && (
        <MiniSparkline data={historyData.slice(-12)} />
      )}
    </span>
  ) : (
    <span className="text-zinc-500">Offline</span>
  )}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/server/MiniSparkline.tsx src/components/server/ServerCard.tsx
git commit -m "feat: add spoofing badges and sparkline to ServerCard"
```

---

## Chunk 5: Server Detail Page Chart

### Files:
- Create: `src/components/server/PlayerCountChart.tsx`
- Modify: `src/app/servers/[id]/page.tsx`

- [ ] **Step 1: Create PlayerCountChart component**

```typescript
// src/components/server/PlayerCountChart.tsx

"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface HistoryPoint {
  observed_count: number;
  self_reported_count: number;
  max_players: number;
  created_at: string;
}

interface PlayerCountChartProps {
  serverId: string;
  ip: string;
  initialData?: HistoryPoint[];
}

type TimeRange = "24h" | "7d" | "30d" | "all";

export function PlayerCountChart({
  serverId,
  ip,
  initialData = [],
}: PlayerCountChartProps) {
  const [range, setRange] = useState<TimeRange>("24h");
  const [data, setData] = useState<HistoryPoint[]>(initialData);
  const [loading, setLoading] = useState(false);

  const fetchData = async (newRange: TimeRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/servers/${ip}/history?range=${newRange}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange);
    if (data.length === 0 || newRange !== range) {
      fetchData(newRange);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (range === "24h") {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (data.length === 0 && !loading) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No player count history available yet. Check back after the next watcher cycle.
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["24h", "7d", "30d", "all"] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => handleRangeChange(r)}
            className={`px-3 py-1 text-sm rounded ${
              range === r
                ? "bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {r === "all" ? "All Time" : r.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="created_at"
              tickFormatter={formatTime}
              stroke="#71717a"
              fontSize={12}
            />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
              }}
              labelFormatter={formatTime}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="observed_count"
              name="Observed"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="self_reported_count"
              name="Self-Reported"
              stroke="#a855f7"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

Note: Install recharts if not already installed:
```bash
npm install recharts
```

- [ ] **Step 2: Update server detail page**

In `src/app/servers/[id]/page.tsx`:

1. Add import:
```typescript
import { PlayerCountChart } from "@/components/server/PlayerCountChart";
```

2. Update ServerDetail interface to include spoofing fields:
```typescript
interface ServerDetail {
  // ... existing fields
  spoofing_flag?: boolean;
  spoofing_score?: number;
}
```

3. Add to the query (around line 91-95):
```typescript
server = await findServer(supabase, id, `
  id, ip, port, name, description, version, tags, verified, vote_count,
  icon, banner, spoofing_flag, spoofing_score,
  server_status (status, latency_ms, player_count, max_players, motd, last_checked)
`) as ServerDetail | null;
```

4. Add chart section after the status section (around line 188, after the votes div):

```typescript
<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
  <h2 className="text-lg font-semibold text-white mb-4">Player Count History</h2>

  {server.spoofing_flag && (
    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm">
      ⚠️ This server has been flagged for potential player count inflation. The chart below shows discrepancies between observed and self-reported counts.
    </div>
  )}

  <PlayerCountChart
    serverId={server.id}
    ip={server.ip}
  />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/server/PlayerCountChart.tsx src/app/servers/[id]/page.tsx
npm install recharts  # if needed
git add package.json package-lock.json
git commit -m "feat: add player count chart to server detail page"
```

---

## Chunk 6: Update Homepage to Pass History Data

### Files:
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Fetch history data for ServerCard sparklines**

We need to pass history data to ServerCard for the sparkline. Add a helper to fetch recent history:

Add to page.tsx after getting servers (around line 76):

```typescript
// For each server, get last 12 history points for sparkline
const serversWithHistory = await Promise.all(
  servers.map(async (server) => {
    const { data: history } = await supabase
      .from("player_count_history")
      .select("observed_count")
      .eq("server_id", server.id)
      .order("created_at", { ascending: false })
      .limit(12);

    return {
      ...server,
      historyData: history?.map((h) => h.observed_count).reverse() ?? [],
    };
  })
);
```

Update the ServerCard rendering to pass historyData:

```typescript
{serversWithHistory?.map((server) => (
  <ServerCard
    key={server.id}
    server={server as unknown as ServerWithStatus}
    historyData={server.historyData}
  />
))}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: pass history data to ServerCard sparklines"
```

---

## Testing Checklist

- [ ] Migration runs without errors
- [ ] Watcher completes and inserts history records
- [ ] `/api/v1/servers/[ip]/history` returns correct data
- [ ] ServerCard shows "Verified Live" badge for clean servers
- [ ] ServerCard shows "Warning" badge for flagged servers
- [ ] Sparkline renders in ServerCard
- [ ] Server detail page shows chart with range toggles
- [ ] Warning message shows on flagged server detail pages
