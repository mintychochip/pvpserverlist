# Zombie Server Detection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-hide offline/zombie servers and keep version in sync with server-reported values.

**Architecture:** Three changes: (1) DB migration adds `last_online_at` column to `servers`; (2) watcher and API persist server-reported `version` and update `last_online_at` on success; (3) frontend filters default to hiding servers offline >24h and surfaces a "Recently Offline" tab.

**Tech Stack:** Next.js App Router, Supabase (Postgres), SLP ping via UDP dgram.

---

## Chunk 1: Backend — DB, Watcher, API

### Files

- Create: `supabase/migrations/002_add_last_online_at.sql`
- Modify: `src/app/api/cron/watcher/route.ts:82-102` (upsertServerStatus + version sync)
- Modify: `src/app/api/server/[ip]/route.ts:54-62` (add version to upsert)
- Modify: `src/app/api/servers/route.ts:6-63` (add filter params)

---

### Task 1: Database migration — add `last_online_at`

**Files:**
- Create: `supabase/migrations/002_add_last_online_at.sql`
- Test: run migration against Supabase

- [ ] **Step 1: Create migration file**

```sql
-- Add last_online_at to servers table for zombie detection
ALTER TABLE servers ADD COLUMN last_online_at TIMESTAMPTZ;

-- Index for efficient offline filtering queries
CREATE INDEX idx_servers_last_online_at ON servers(last_online_at);

-- Backfill: set last_online_at to now() for servers that have a server_status row with status=true
UPDATE servers
SET last_online_at = now()
WHERE last_online_at IS NULL
  AND EXISTS (
    SELECT 1 FROM server_status
    WHERE server_status.server_id = servers.id
    AND server_status.status = true
  );
```

- [ ] **Step 2: Apply migration to Supabase**

Run locally:
```bash
npx supabase db push
```
Or apply via Supabase dashboard SQL editor.

Expected: Migration applies cleanly, `idx_servers_last_online_at` index created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_add_last_online_at.sql
git commit -m "feat: add last_online_at column for zombie server detection"
```

---

### Task 2: Watcher — persist version and sync `last_online_at`

**Files:**
- Modify: `src/app/api/cron/watcher/route.ts`

- [ ] **Step 1: Modify `upsertServerStatus` to accept and store `version`**

Find the `upsertServerStatus` function (lines 82-102) and update the upsert payload to include `version`:

```ts
async function upsertServerStatus(supabase: any,
  serverId: string,
  status: boolean,
  latencyMs: number | null,
  playerCount: number,
  maxPlayers: number,
  motd: string,
  version: string  // NEW
): Promise<void> {
  await supabase.from("server_status").upsert(
    {
      server_id: serverId,
      status,
      latency_ms: latencyMs,
      player_count: playerCount,
      max_players: maxPlayers,
      motd,
      version,  // NEW — store server-reported version
      last_checked: new Date().toISOString(),
    } as never,
    { onConflict: "server_id" }
  );
}
```

- [ ] **Step 2: Update all call sites of `upsertServerStatus` to pass `version`**

Search for all calls to `upsertServerStatus` and add `result.version` as the last argument:

In the batch results loop (around line 190-200), change:
```ts
upsertServerStatus(
  supabase,
  server.id,
  result.status,
  result.latency_ms,
  result.player_count,
  result.max_players,
  result.motd
).then(...)
```

To:
```ts
upsertServerStatus(
  supabase,
  server.id,
  result.status,
  result.latency_ms,
  result.player_count,
  result.max_players,
  result.motd,
  result.version  // ADD THIS
).then(...)
```

- [ ] **Step 3: Add `servers.version` and `last_online_at` sync on successful ping**

After the `upsertServerStatus` call inside `.then(...)`, add:

```ts
// Sync server-reported version and last_online_at when online
if (result.status) {
  await supabase
    .from("servers")
    .update({
      version: result.version,
      last_online_at: new Date().toISOString(),
    })
    .eq("id", server.id);
}
```

**Important:** If `result.version` is empty or invalid (e.g., blank string), don't update `version` — keep the previous value. Add a guard:

```ts
if (result.status) {
  const update: Record<string, unknown> = {
    last_online_at: new Date().toISOString(),
  };
  // Only update version if we got a meaningful value
  if (result.version && result.version.trim() !== "") {
    update.version = result.version;
  }
  await supabase
    .from("servers")
    .update(update)
    .eq("id", server.id);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/watcher/route.ts
git commit -m "feat(watcher): persist server-reported version and last_online_at"
```

---

### Task 3: `/api/server/[ip]` — add version to status upsert

**Files:**
- Modify: `src/app/api/server/[ip]/route.ts:54-62`

- [ ] **Step 1: Add `version` to the server_status upsert when refreshing stale cache**

In the edge function refresh block (around lines 54-62), add `version` to the upsert payload:

```ts
await supabase.from("server_status").upsert({
  server_id: server.id,
  status: pingData.status ?? false,
  latency_ms: pingData.latency_ms ?? null,
  player_count: pingData.player_count ?? 0,
  max_players: pingData.max_players ?? 0,
  motd: pingData.motd ?? "",
  version: pingData.version ?? "",  // ADD THIS
  last_checked: new Date().toISOString(),
});
```

Also update the return object to include version:
```ts
return NextResponse.json({
  status: {
    status: pingData.status ?? false,
    latency_ms: pingData.latency_ms ?? null,
    player_count: pingData.player_count ?? 0,
    max_players: pingData.max_players ?? 0,
    version: pingData.version ?? "",  // ADD THIS
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/server/[ip]/route.ts
git commit -m "feat(server-status): include server-reported version in status upsert"
```

---

### Task 4: `/api/servers` — add `max_offline_hours` and `show_offline` filters

**Files:**
- Modify: `src/app/api/servers/route.ts`

- [ ] **Step 1: Add new query params and filter logic**

At the top of `GET`, parse the new params:

```ts
const maxOfflineHours = parseInt(url.searchParams.get("max_offline_hours") ?? "0"); // 0 = no filter
const showOffline = url.searchParams.get("show_offline") === "true";
```

Add filter logic after the search filter and before the sort block. The filter should exclude servers that have been offline for more than `maxOfflineHours`:

```ts
// Filter by offline duration
if (maxOfflineHours > 0) {
  const cutoff = new Date(Date.now() - maxOfflineHours * 60 * 60 * 1000).toISOString();
  // Only include servers that were online within the cutoff window
  // OR have never been checked (keep new servers that haven't been pinged yet)
  query = query.or(
    `last_online_at.gte.${cutoff},last_online_at.is.null`
  );
}
```

Note: Supabase `.or()` with `.eq()` and `.is.null()` can be tricky. Verify the generated query works. Alternative approach using a join filter:

```ts
if (maxOfflineHours > 0) {
  const cutoff = new Date(Date.now() - maxOfflineHours * 60 * 60 * 1000).toISOString();
  // Join with server_status and filter by last_online_at
  query = query.filter("last_online_at", "gte", cutoff);
}
```

Also add a filter for `showOffline` — if false (default), exclude servers with no `last_online_at` (never online):

```ts
// If showOffline is false (default), exclude servers never online
if (!showOffline && maxOfflineHours > 0) {
  query = query.not("last_online_at", "is", null);
}
```

Wait — `showOffline` is a separate concept. Let me re-read the spec:

- `max_offline_hours=24` + `show_offline` not set → hide servers offline >24h
- `show_offline=true&max_offline_hours=72` → show recently offline (24-72h)

The cleanest implementation: treat `show_offline=true` as "show servers that would be excluded by max_offline_hours". So:

```ts
if (maxOfflineHours > 0) {
  const cutoff = new Date(Date.now() - maxOfflineHours * 60 * 60 * 1000).toISOString();
  if (showOffline) {
    // Show servers that ARE offline but within the window
    query = query.lt("last_online_at", cutoff).not("last_online_at", "is", null);
  } else {
    // Hide servers offline longer than cutoff
    query = query.or(`last_online_at.gte.${cutoff},last_online_at.is.null`);
  }
}
```

- [ ] **Step 2: Test the filter logic**

Start the dev server and test with curl:

```bash
# Should return only servers online in last 24h + never-online servers
curl "http://localhost:3000/api/servers?max_offline_hours=24"

# Should return servers that went offline in last 72h
curl "http://localhost:3000/api/servers?show_offline=true&max_offline_hours=72"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/servers/route.ts
git commit -m "feat(api): add max_offline_hours and show_offline filters"
```

---

## Chunk 2: Frontend — UI Toggles, Tabs, Version Display

### Files

- Modify: `src/app/page.tsx` (default filter + tab state)
- Modify: `src/components/server/FilterBar.tsx` (hide offline toggle)
- Modify: `src/components/server/ServerCard.tsx` (version badge + last seen)

---

### Task 5: FilterBar — add "Hide offline" toggle

**Files:**
- Modify: `src/components/server/FilterBar.tsx`

- [ ] **Step 1: Read FilterBar to understand current structure**

The FilterBar is a client component that reads/writes URL params. It already handles sort, tag, version, search. Add a "Hide offline" toggle that sets `max_offline_hours=24` in the URL.

- [ ] **Step 2: Add toggle button**

Add a toggle after the existing filter controls. When active, appends `max_offline_hours=24` to the URL. When inactive, removes it.

The toggle should be a checkbox-style button with an eye/eye-off icon (e.g., `Eye` and `EyeOff` from lucide-react).

Default state: **active** (hide offline by default).

Implementation approach: use `useSearchParams` and `useRouter`/`Link`. The toggle is just a `<button>` that toggles the param.

```tsx
const searchParams = useSearchParams();
const hideOffline = searchParams.get("max_offline_hours") === "24";
const showOffline = searchParams.get("show_offline") === "true";

function toggleHideOffline() {
  const params = new URLSearchParams(searchParams.toString());
  if (hideOffline) {
    params.delete("max_offline_hours");
  } else {
    params.set("max_offline_hours", "24");
    params.delete("show_offline"); // switching away from recently offline tab
  }
  router.push(`/?${params.toString()}`);
}
```

- [ ] **Step 3: Add "Recently Offline" tab**

Add a secondary tab/button next to or near the main list that shows recently offline servers. This would set `show_offline=true&max_offline_hours=72`.

```tsx
function showRecentlyOffline() {
  const params = new URLSearchParams(searchParams.toString());
  params.set("show_offline", "true");
  params.set("max_offline_hours", "72");
  router.push(`/?${params.toString()}`);
}
```

UI: a small tab or pill button. Can say "Recently Offline" with a small count badge if feasible.

- [ ] **Step 4: Commit**

```bash
git add src/components/server/FilterBar.tsx
git commit -m "feat(filter): add hide offline toggle and recently offline tab"
```

---

### Task 6: ServerCard — show last_seen for offline servers

**Files:**
- Modify: `src/components/server/ServerCard.tsx`

- [ ] **Step 1: Update `LastChecked` component to show last seen for offline servers**

Currently `LastChecked` shows "checked X ago". Change it so:
- Online servers: show "checked X ago" (existing behavior)
- Offline servers: show "last seen X ago" (new label)

```tsx
function LastChecked({ time, isOnline }: { time?: string; isOnline: boolean }) {
  if (!time) return null;
  const date = new Date(time);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  let label: string;
  if (diffMins < 1) label = "just now";
  else if (diffMins < 60) label = `${diffMins}m ago`;
  else if (diffMins < 1440) label = `${Math.floor(diffMins / 60)}h ago`;
  else label = date.toLocaleDateString();

  return (
    <span className="text-xs text-zinc-600" title={date.toLocaleString()}>
      {isOnline ? "checked" : "last seen"} {label}
    </span>
  );
}
```

Update call site in ServerCard:
```tsx
<LastChecked time={last_checked} isOnline={isOnline} />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/server/ServerCard.tsx
git commit -m "feat(servercard): show last seen time for offline servers"
```

---

### Task 7: Home page — default to hiding offline, show offline tab

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update `searchParams` to read `max_offline_hours` and `show_offline`**

Add to the destructured `searchParams` and pass to the query:

```tsx
const hideOffline = params.max_offline_hours === "24";
const showOffline = params.show_offline === "true";
const maxOfflineHours = parseInt(params.max_offline_hours ?? "0");
```

- [ ] **Step 2: Build the Supabase query with offline filter**

If `maxOfflineHours > 0`, apply the same filter logic as the API (but on the server side in page.tsx):

```tsx
if (maxOfflineHours > 0) {
  const cutoff = new Date(Date.now() - maxOfflineHours * 60 * 60 * 1000).toISOString();
  if (showOffline) {
    query = query.lt("last_online_at", cutoff).not("last_online_at", "is", null);
  } else {
    query = query.or(`last_online_at.gte.${cutoff},last_online_at.is.null`);
  }
}
```

Also update the page heading to reflect the tab state:
- Default (hide offline): heading stays "Best Minecraft PvP Servers"
- Recently Offline tab: heading changes to "Recently Offline Servers"

- [ ] **Step 3: Update pagination links to preserve offline filters**

Update the `href` strings in the pagination section to include `max_offline_hours` and `show_offline` params:

```tsx
const filterParams = `max_offline_hours=${maxOfflineHours}${showOffline ? "&show_offline=true" : ""}`;
```

Then append `${filterParams}` to pagination hrefs.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): default to hiding offline servers, support recently offline tab"
```

---

## Chunk 3: server_status schema — add version column

### Files

- Create: `supabase/migrations/003_add_version_to_server_status.sql`

---

### Task 8: Add `version` column to `server_status`

**Files:**
- Create: `supabase/migrations/003_add_version_to_server_status.sql`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE server_status ADD COLUMN version TEXT;
```

The watcher and API already write to this column in the upsert — they just need the column to exist.

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_add_version_to_server_status.sql
git commit -m "feat: add version column to server_status table"
```
