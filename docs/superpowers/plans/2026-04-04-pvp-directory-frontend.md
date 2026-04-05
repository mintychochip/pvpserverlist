# PvP Directory — Frontend + Features Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete frontend: server list page with cards, server detail page, submission flow, verification, voting system, category pages, and SEO JSON-LD.

**Architecture:** Next.js 15 App Router with React Server Components for data fetching, client components for interactivity. Tailwind CSS dark theme. Server pages use ISR (60s revalidate), detail pages use SSR + client polling.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, Lucide React

---

## Chunk 7: Programmatic SEO Pages (Long-Tail)

### Task 10: Programmatic SEO — Version/Tag/Region Pages

**Files:**
- Create: `src/app/minecraft/version/[version]/[tag]/[region]/page.tsx`
- Create: `src/app/minecraft/tag/[tag]/[variant]/page.tsx`
- Modify: `src/app/api/servers/route.ts` (add region filter)

These are the "long-tail net" pages that auto-generate for every combination of version + tag + region, capturing AI-driven search traffic.

- [ ] **Step 1: Add region filter to server list API**

Add `region` query param to `src/app/api/servers/route.ts`:
```typescript
if (region) {
  query = query.eq("region", region);
}
```

- [ ] **Step 2: Write version/tag/region page**

```typescript
// src/app/minecraft/version/[version]/[tag]/[region]/page.tsx

import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { Metadata } from "next";

const VERSION_LABELS: Record<string, string> = {
  "1.21.1": "Minecraft 1.21.1",
  "1.21": "Minecraft 1.21",
  "1.20.4": "Minecraft 1.20.4",
  "1.16": "Minecraft 1.16",
  "1.12": "Minecraft 1.12",
  "1.8": "Minecraft 1.8",
};

const TAG_LABELS: Record<string, string> = {
  "crystal-pvp": "Crystal PvP",
  "uhc-pvp": "UHC PvP",
  "sumo": "Sumo",
  "nodepuff": "NoDebuff",
  "lifesteal": "Lifesteal",
  "smp": "SMP",
  "practice": "Practice",
  "bridge": "Bridge",
  "hunger-games": "Hunger Games",
  "prison": "Prison",
};

const REGION_LABELS: Record<string, string> = {
  "north-america": "North America",
  "europe": "Europe",
  "asia": "Asia",
  "oceania": "Oceania",
  "south-america": "South America",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string; tag: string; region: string }>;
}): Promise<Metadata> {
  const { version, tag, region } = await params;
  const versionLabel = VERSION_LABELS[version] ?? version;
  const tagLabel = TAG_LABELS[tag] ?? tag;
  const regionLabel = REGION_LABELS[region] ?? region;
  return {
    title: `${versionLabel} ${tagLabel} Servers (${regionLabel}) | PvP Index`,
    description: `Find the best ${versionLabel} ${tagLabel} servers hosted in ${regionLabel}. Real-time latency, player counts, and verified rankings.`,
  };
}

export default async function VersionTagRegionPage({
  params,
}: {
  params: Promise<{ version: string; tag: string; region: string }>;
}) {
  const { version, tag, region } = await params;
  const supabase = await createClient();

  const { data: servers } = await supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players)
    `)
    .eq("version", version)
    .contains("tags", [tag])
    .eq("region", region)
    .order("vote_count", { ascending: false })
    .limit(50);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4">
          <a href="/minecraft" className="text-sm text-zinc-500 hover:text-white transition-colors">← Back</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          {VERSION_LABELS[version] ?? version} {TAG_LABELS[tag] ?? tag} — {REGION_LABELS[region] ?? region}
        </h1>
        <p className="text-zinc-400 mb-6">
          {servers?.length ?? 0} servers found
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          {servers?.map((server) => (
            <ServerCard key={server.id} server={server as any} />
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Write tag/variant page**

```typescript
// src/app/minecraft/tag/[tag]/[variant]/page.tsx
// Similar structure — variant could be "low-ping", "no-p2w", "seasonal"
// Falls back to tag-only page if variant not provided
```

- [ ] **Step 4: Commit**

```bash
git add src/app/minecraft/version/[version]/[tag]/[region]/page.tsx src/app/minecraft/tag/[tag]/[variant]/page.tsx
git commit -m "feat: add programmatic SEO pages for version/tag/region combinations"
```

---

## Chunk 1: Core UI Components

### Task 1: Server Card Component

**Files:**
- Create: `src/components/server/ServerCard.tsx`

- [ ] **Step 1: Write ServerCard component**

```typescript
// src/components/server/ServerCard.tsx

"use client";

import { cn } from "@/lib/utils";
import { Server, Vote, Wifi, WifiOff } from "lucide-react";

interface ServerCardProps {
  server: {
    id: string;
    ip: string;
    port: number;
    name: string;
    description: string | null;
    version: string | null;
    tags: string[];
    verified: boolean;
    vote_count: number;
    server_status?: {
      status: boolean;
      latency_ms: number | null;
      player_count: number;
      max_players: number;
    };
  };
  onVote?: (serverId: string) => void;
}

function PingBadge({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  const color = ms < 50 ? "text-green-400" : ms < 150 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={cn("flex items-center gap-1 text-xs font-mono", color)}>
      {ms}ms
    </span>
  );
}

export function ServerCard({ server, onVote }: ServerCardProps) {
  const { status, latency_ms, player_count, max_players } = server.server_status ?? {};
  const isOnline = status === true;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
            {isOnline ? (
              <Server className="w-5 h-5 text-green-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-zinc-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              {server.name}
              {server.verified && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                  ✓ Verified
                </span>
              )}
            </h3>
            <p className="text-xs text-zinc-500 font-mono">
              {server.ip}:{server.port}
            </p>
          </div>
        </div>

        <div className="text-right">
          {latency_ms !== undefined && latency_ms !== null ? (
            <PingBadge ms={latency_ms} />
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>
      </div>

      {server.description && (
        <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
          {server.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        {server.version && (
          <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
            {server.version}
          </span>
        )}
        {server.tags?.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
        <div className="text-sm">
          {isOnline ? (
            <span className="text-green-400">
              {player_count}/{max_players} online
            </span>
          ) : (
            <span className="text-zinc-500">Offline</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Vote className="w-3 h-3" />
            {server.vote_count}
          </span>
          <button
            onClick={() => onVote?.(server.id)}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Vote
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/server/ServerCard.tsx
git commit -m "feat: add ServerCard component with ping badge and vote button"
```

---

### Task 2: Filter Bar Component

**Files:**
- Create: `src/components/server/FilterBar.tsx`

- [ ] **Step 1: Write FilterBar component**

```typescript
// src/components/server/FilterBar.tsx

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search } from "lucide-react";

const TAGS = ["crystal-pvp", "uhc-pvp", "sumo", "nodepuff", "lifesteal", "smp", "practice", "bridge"];
const VERSIONS = ["1.8", "1.12", "1.16", "1.20.4"];
const SORTS = [
  { value: "votes", label: "Most Votes" },
  { value: "players", label: "Most Players" },
  { value: "latency", label: "Lowest Ping" },
  { value: "newest", label: "Newest" },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/?${params.toString()}`);
  }, [router, searchParams]);

  const currentTag = searchParams.get("tag") ?? "";
  const currentVersion = searchParams.get("version") ?? "";
  const currentSort = searchParams.get("sort") ?? "votes";
  const currentSearch = searchParams.get("search") ?? "";

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search servers..."
          defaultValue={currentSearch}
          onChange={(e) => updateParam("search", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
        />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => updateParam("tag", "")}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            !currentTag
              ? "bg-indigo-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          All
        </button>
        {TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => updateParam("tag", tag)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              currentTag === tag
                ? "bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Version + Sort row */}
      <div className="flex gap-3">
        <select
          value={currentVersion}
          onChange={(e) => updateParam("version", e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
        >
          <option value="">All Versions</option>
          {VERSIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <select
          value={currentSort}
          onChange={(e) => updateParam("sort", e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/server/FilterBar.tsx
git commit -m "feat: add FilterBar component with search, tags, version, and sort filters"
```

---

## Chunk 2: Server List Page

### Task 3: Home Page with Server List

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write home page**

```typescript
// src/app/page.tsx

import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { FilterBar } from "@/components/server/FilterBar";

export const revalidate = 60; // ISR: revalidate every 60s

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; tag?: string; version?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const sort = params.sort ?? "votes";
  const tag = params.tag;
  const version = params.version;
  const search = params.search;
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  let query = supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players, last_checked)
    `, { count: "exact" });

  if (tag) query = query.contains("tags", [tag]);
  if (version) query = query.eq("version", version);
  if (search) query = query.ilike("name", `%${search}%`);

  if (sort === "votes") query = query.order("vote_count", { ascending: false });
  else if (sort === "players") query = query.order("player_count", { ascending: false });
  else if (sort === "latency") query = query.order("latency_ms", { ascending: true, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });

  query = query.range(offset, offset + limit - 1);

  const { data: servers, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / limit);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">PvP Index</h1>
          <nav className="flex gap-4">
            <a href="/top" className="text-sm text-zinc-400 hover:text-white transition-colors">Top Servers</a>
            <a href="/submit" className="text-sm text-zinc-400 hover:text-white transition-colors">Submit</a>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Best Minecraft PvP Servers
          </h2>
          <p className="text-zinc-400">
            Real-time latency checks. Ranked by performance. Updated daily.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <FilterBar />
        </div>

        {/* Server Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          {servers?.map((server) => (
            <ServerCard key={server.id} server={server as any} />
          ))}

          {servers?.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              No servers found. <a href="/submit" className="text-indigo-400 hover:underline">Submit one!</a>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {page > 1 && (
              <a href={`/?page=${page - 1}&sort=${sort}${tag ? `&tag=${tag}` : ""}${version ? `&version=${version}` : ""}`}
                 className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm">
                Previous
              </a>
            )}
            <span className="px-4 py-2 text-zinc-500 text-sm">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <a href={`/?page=${page + 1}&sort=${sort}${tag ? `&tag=${tag}` : ""}${version ? `&version=${version}` : ""}`}
                 className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm">
                Next
              </a>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800 py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-zinc-600 text-sm">
          PvP Index — Real-time Minecraft server status
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: build home page with server list, filters, and pagination"
```

---

## Chunk 3: Server Detail Page

### Task 4: Individual Server Page

**Files:**
- Create: `src/app/servers/[ip]/page.tsx`
- Create: `src/components/server/ServerStatusPoller.tsx`

- [ ] **Step 1: Write ServerStatusPoller (client component)**

```typescript
// src/components/server/ServerStatusPoller.tsx

"use client";

import { useEffect, useState } from "react";

interface ServerStatus {
  status: boolean;
  latency_ms: number | null;
  player_count: number;
  max_players: number;
}

export function ServerStatusPoller({ ip, port, initialStatus }: {
  ip: string;
  port: number;
  initialStatus?: ServerStatus;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/server/${ip}?port=${port}`);
        const data = await res.json();
        setStatus(data.status);
      } catch {
        // Ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [ip, port]);

  if (!status) return null;

  const pingColor = !status.latency_ms
    ? "text-zinc-500"
    : status.latency_ms < 50
    ? "text-green-400"
    : status.latency_ms < 150
    ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="flex items-center gap-4">
      <span className={pingColor}>
        {status.latency_ms !== null ? `${status.latency_ms}ms` : "—"}
      </span>
      <span className="text-zinc-400">
        {status.status ? (
          <span className="text-green-400">{status.player_count}/{status.max_players} players</span>
        ) : (
          <span className="text-zinc-500">Offline</span>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write server detail page**

```typescript
// src/app/servers/[ip]/page.tsx

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServerStatusPoller } from "@/components/server/ServerStatusPoller";
import { VoteButton } from "@/components/server/VoteButton";

export const revalidate = 0; // SSR: always fresh

export default async function ServerPage({
  params,
}: {
  params: Promise<{ ip: string }>;
}) {
  const { ip } = await params;
  const supabase = await createClient();

  const { data: server } = await supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players, motd, last_checked)
    `)
    .eq("ip", ip)
    .maybeSingle();

  if (!server) notFound();

  const status = server.server_status;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-4xl mx-auto px-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
            ← Back to list
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Server Header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                {server.name}
                {server.verified && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                    ✓ Verified
                  </span>
                )}
              </h1>
              <p className="text-zinc-500 font-mono mt-1">
                {server.ip}:{server.port}
              </p>
            </div>
            <VoteButton serverId={server.id} />
          </div>

          <div className="flex items-center gap-6 mb-4">
            <ServerStatusPoller
              ip={server.ip}
              port={server.port}
              initialStatus={status ?? undefined}
            />
          </div>

          {server.description && (
            <p className="text-zinc-400 mt-4">{server.description}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {server.version && (
              <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">
                {server.version}
              </span>
            )}
            {server.tags?.map((tag: string) => (
              <span key={tag} className="text-xs bg-purple-900/30 text-purple-300 px-2 py-1 rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Vote count */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Votes</h2>
          <p className="text-3xl font-bold text-indigo-400">{server.vote_count}</p>
          <p className="text-sm text-zinc-500 mt-1">Total votes received</p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Write VoteButton component**

```typescript
// src/components/server/VoteButton.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VoteButton({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState(false);

  const handleVote = async () => {
    if (voted || loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId }),
        credentials: "include",
      });

      if (res.ok) {
        setVoted(true);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleVote}
      disabled={voted || loading}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        voted
          ? "bg-green-600 text-white cursor-default"
          : "bg-indigo-600 hover:bg-indigo-500 text-white"
      }`}
    >
      {loading ? "..." : voted ? "✓ Voted!" : "Vote"}
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/servers/[ip]/page.tsx src/components/server/ServerStatusPoller.tsx src/components/server/VoteButton.tsx
git commit -m "feat: add server detail page with real-time status polling and voting"
```

---

## Chunk 4: Submission + Verification Flow

### Task 5: Server Submission Form

**Files:**
- Create: `src/app/submit/page.tsx`
- Create: `src/components/submit/SubmitForm.tsx`

- [ ] **Step 1: Write SubmitForm component**

```typescript
// src/components/submit/SubmitForm.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TAG_OPTIONS = [
  "crystal-pvp", "uhc-pvp", "sumo", "nodepuff", "lifesteal",
  "smp", "practice", "bridge", "hunger-games", "prison"
];

export function SubmitForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    ip: "",
    port: "25565",
    name: "",
    description: "",
    version: "",
    tags: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Submission failed");
        return;
      }

      router.push(`/submit/verify/${data.serverId}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter((t) => t !== tag)
        : [...f.tags, tag],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Server IP *</label>
        <input
          type="text"
          required
          placeholder="play.example.com"
          value={form.ip}
          onChange={(e) => setForm({ ...form, ip: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Port</label>
        <input
          type="number"
          placeholder="25565"
          value={form.port}
          onChange={(e) => setForm({ ...form, port: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Server Name *</label>
        <input
          type="text"
          required
          placeholder="My Awesome PvP Server"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
        <textarea
          rows={3}
          placeholder="What makes your server special..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Version</label>
        <input
          type="text"
          placeholder="1.20.4"
          value={form.version}
          onChange={(e) => setForm({ ...form, version: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Tags</label>
        <div className="flex flex-wrap gap-2">
          {TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                form.tags.includes(tag)
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium py-2 rounded-lg transition-colors"
      >
        {loading ? "Submitting..." : "Submit Server"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write submit page**

```typescript
// src/app/submit/page.tsx

import { Metadata } from "next";
import { SubmitForm } from "@/components/submit/SubmitForm";

export const metadata: Metadata = {
  title: "Submit Server — PvP Index",
  description: "Submit your Minecraft server to PvP Index.",
};

export default function SubmitPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-4xl mx-auto px-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
            ← Back
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">Submit Your Server</h1>
        <p className="text-zinc-400 mb-6">Add your server to the PvP Index directory.</p>
        <SubmitForm />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Write submit API route**

```typescript
// src/app/api/submit/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "crypto";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ip, port, name, description, version, tags } = body;

  if (!ip || !name) {
    return NextResponse.json({ error: "IP and name are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Insert server
  const { data: server, error } = await supabase
    .from("servers")
    .insert({
      ip,
      port: parseInt(port ?? "25565"),
      name,
      description: description ?? null,
      version: version ?? null,
      tags: tags ?? [],
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate verification token
  const token = uuidv4().replace(/-/g, "").slice(0, 12);
  await supabase.from("verification_tokens").insert({
    server_id: server.id,
    token,
    motd_pattern: `PvPIndex: ${token}`,
  });

  return NextResponse.json({ serverId: server.id, token });
}
```

- [ ] **Step 4: Write verification page**

```typescript
// src/app/submit/verify/[serverId]/page.tsx

import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  const supabase = createAdminClient();

  const { data: server } = await supabase
    .from("servers")
    .select("id, name, ip, port")
    .eq("id", serverId)
    .single();

  if (!server) notFound();

  const { data: token } = await supabase
    .from("verification_tokens")
    .select("token, expires_at, verified_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!token) notFound();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-lg w-full">
        <h1 className="text-xl font-bold text-white mb-4">Verify {server.name}</h1>

        {token.verified_at ? (
          <div className="bg-green-900/20 border border-green-800 text-green-400 px-4 py-3 rounded-lg">
            ✓ Server verified! Your listing is now live.
          </div>
        ) : (
          <>
            <p className="text-zinc-400 text-sm mb-4">
              Add this token to your server&apos;s MOTD to verify ownership:
            </p>
            <div className="bg-zinc-800 rounded-lg p-4 mb-4">
              <code className="text-indigo-400 font-mono text-lg">{token.token}</code>
            </div>
            <p className="text-zinc-500 text-sm">
              Add <code className="text-zinc-300">PvPIndex: {token.token}</code> to your server MOTD,
              then restart your server. Verification expires in 10 minutes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/submit/page.tsx src/components/submit/SubmitForm.tsx src/app/api/submit/route.ts src/app/submit/verify/[serverId]/page.tsx
git commit -m "feat: add server submission form and MOTD verification flow"
```

---

## Chunk 5: Vote API

### Task 6: Vote Endpoint with CSRF + Cooldown

**Files:**
- Create: `src/app/api/vote/route.ts`

- [ ] **Step 1: Write vote API with CSRF and cooldown**

```typescript
// src/app/api/vote/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // CSRF check
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !origin.includes(host ?? "")) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await req.json();
  const { serverId } = body;

  if (!serverId) {
    return NextResponse.json({ error: "serverId required" }, { status: 400 });
  }

  // Get visitor IP (via x-forwarded-for or cf-connecting-ip)
  const forwarded = req.headers.get("x-forwarded-for");
  const visitorIp = forwarded?.split(",")[0]?.trim() ?? "unknown";

  const supabase = createAdminClient();

  // Check 24h cooldown
  const { count } = await supabase
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("server_id", serverId)
    .eq("visitor_ip", visitorIp)
    .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (count && count > 0) {
    return NextResponse.json({ error: "You can only vote once every 24 hours" }, { status: 429 });
  }

  // Record vote
  const { error } = await supabase.from("votes").insert({
    server_id: serverId,
    visitor_ip: visitorIp,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment vote count
  await supabase.rpc("increment_vote_count", { server_id: serverId });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Create increment_vote_count SQL function**

Run via Supabase SQL editor:
```sql
CREATE OR REPLACE FUNCTION increment_vote_count(server_id UUID)
RETURNS VOID AS $$
  UPDATE servers SET vote_count = vote_count + 1 WHERE id = server_id;
$$ LANGUAGE SQL SECURITY DEFINER;
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/vote/route.ts
git commit -m "feat: add vote API with CSRF protection and 24h cooldown"
```

---

## Chunk 6: SEO — Category Pages + JSON-LD

### Task 7: Category Pages

**Files:**
- Create: `src/app/category/[tag]/page.tsx`

- [ ] **Step 1: Write category page**

```typescript
// src/app/category/[tag]/page.tsx

import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { Metadata } from "next";

const TAG_LABELS: Record<string, string> = {
  "crystal-pvp": "Crystal PvP Servers",
  "uhc-pvp": "UHC PvP Servers",
  "sumo": "Sumo PvP Servers",
  "nodepuff": "NoDebuff PvP Servers",
  "lifesteal": "Lifesteal Servers",
  "smp": "SMP Servers",
  "practice": "Practice PvP Servers",
  "bridge": "Bridge PvP Servers",
  "hunger-games": "Hunger Games Servers",
  "prison": "Prison Servers",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const label = TAG_LABELS[tag] ?? tag;
  return {
    title: `${label} — PvP Index`,
    description: `Find the best ${label.toLowerCase()}. Real-time latency and player counts.`,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const supabase = await createClient();

  const { data: servers } = await supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players)
    `)
    .contains("tags", [tag])
    .order("vote_count", { ascending: false })
    .limit(50);

  const label = TAG_LABELS[tag] ?? tag;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">← Back</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">{label}</h1>
        <p className="text-zinc-400 mb-6">
          {servers?.length ?? 0} servers found
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          {servers?.map((server) => (
            <ServerCard key={server.id} server={server as any} />
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/category/[tag]/page.tsx
git commit -m "feat: add dynamic category pages with metadata"
```

---

### Task 8: Top Servers Page

**Files:**
- Create: `src/app/top/page.tsx`

- [ ] **Step 1: Write top page**

```typescript
// src/app/top/page.tsx

import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Servers — PvP Index",
  description: "Highest ranked Minecraft PvP servers by votes.",
};

export default async function TopPage() {
  const supabase = await createClient();

  const { data: servers } = await supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players)
    `)
    .order("vote_count", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">← Back</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">Top Servers</h1>
        <p className="text-zinc-400 mb-6">Ranked by community votes.</p>

        <div className="space-y-2">
          {servers?.map((server, i) => (
            <div key={server.id} className="flex items-center gap-4">
              <span className="text-2xl font-bold text-zinc-600 w-8 text-right">
                {i + 1}
              </span>
              <div className="flex-1">
                <ServerCard server={server as any} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/top/page.tsx
git commit -m "feat: add top servers page ranked by votes"
```

---

### Task 9: JSON-LD Schema

**Files:**
- Modify: `src/app/page.tsx` (add JSON-LD)
- Modify: `src/app/servers/[ip]/page.tsx` (add JSON-LD)

- [ ] **Step 1: Add JSON-LD to home page**

Add this inside the page component, before the return:

```typescript
// In src/app/page.tsx, add import:
import { JsonLd } from "@/components/seo/JsonLd";

// Add after metadata export:
export default async function HomePage(...) {
  const serversListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Best Minecraft PvP Servers 2026",
    itemListElement: servers?.map((server, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SoftwareApplication",
        name: server.name,
        applicationCategory: "GameServer",
        operatingSystem: server.version ?? "Minecraft",
        ...(server.server_status && {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.5",
            ratingCount: server.vote_count,
          },
        }),
      },
    })),
  };
```

And in the JSX return:
```tsx
<JsonLd data={serversListJsonLd} />
```

- [ ] **Step 2: Create JsonLd component**

```typescript
// src/components/seo/JsonLd.tsx

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/seo/JsonLd.tsx
git commit -m "feat: add JSON-LD schema components for rich snippets"
```

---

**Frontend + Features plan complete.** Three plans now ready for execution.
