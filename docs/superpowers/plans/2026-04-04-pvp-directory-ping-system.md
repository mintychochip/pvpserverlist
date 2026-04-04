# PvP Directory — Core Ping System Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SLP (Server List Ping) ping worker in a Supabase Edge Function, wire it to the Next.js API route, implement server status caching with 10-minute staleness, and create the public API endpoints.

**Architecture:** Supabase Edge Function written in Deno/TypeScript pings Minecraft servers via SLP (UDP). Next.js API routes proxy requests and manage cache. Redis-free approach: cache stored in `server_status` table with `last_checked` timestamp.

**Tech Stack:** Deno, TypeScript, Supabase Edge Functions, Next.js API Routes

---

## Chunk 1: SLP Ping Edge Function

### Task 1: Implement SLP Ping Protocol

**Files:**
- Create: `supabase/functions/slp-ping/index.ts`

SLP (Server List Ping) is a UDP-based Minecraft protocol. The Edge Function must:

1. Send a handshake packet (0xFE with protocol version)
2. Send a request packet (0xFE)
3. Read the response containing: MOTD, player count, max players, version
4. Measure latency

- [ ] **Step 1: Write the SLP ping implementation**

```typescript
// supabase/functions/slp-ping/index.ts

interface SlpResponse {
  status: boolean;
  latency_ms: number | null;
  player_count: number;
  max_players: number;
  motd: string;
  version: string;
  error?: string;
}

const PROTOCOL_VERSION = 47; // 1.8 protocol, works across all versions
const TIMEOUT_MS = 3000;

function buildHandshakePacket(protocolVersion: number, serverAddress: string, serverPort: number): Uint8Array {
  const addressBytes = new TextEncoder().encode(serverAddress);
  // Packet: packet_id (1 byte) + protocol_version (varint) + address (string) + port (2 bytes) + state (varint)
  // State 1 = status
  const packet = new Uint8Array(1 + varintLength(protocolVersion) + addressBytes.length + 1 + 2 + varintLength(1));
  let offset = 0;
  packet[offset++] = 0x00; // Handshake packet ID
  offset = writeVarint(packet, offset, protocolVersion);
  offset = writeString(packet, offset, serverAddress);
  packet[offset++] = serverPort & 0xFF;
  packet[offset++] = (serverPort >> 8) & 0xFF;
  offset = writeVarint(packet, offset, 1); // Status state
  return packet;
}

function buildRequestPacket(): Uint8Array {
  return new Uint8Array([0xFE]); // Status request
}

function writeVarint(buf: Uint8Array, offset: number, value: number): number {
  while (value > 0x7F) {
    buf[offset++] = (value & 0x7F) | 0x80;
    value >>= 7;
  }
  buf[offset++] = value & 0x7F;
  return offset;
}

function writeString(buf: Uint8Array, offset: number, str: string): number {
  const bytes = new TextEncoder().encode(str);
  offset = writeVarint(buf, offset, bytes.length);
  buf.set(bytes, offset);
  return offset + bytes.length;
}

function readVarint(data: Uint8Array, offset: number): { value: number; newOffset: number } {
  let result = 0;
  let shift = 0;
  while (true) {
    const b = data[offset++];
    result |= (b & 0x7F) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, newOffset: offset };
}

function varintLength(value: number): number {
  let len = 0;
  while (value > 0x7F) { len++; value >>= 7; }
  return len + 1;
}

async function pingServer(host: string, port: number): Promise<SlpResponse> {
  const start = Date.now();

  // Build packets
  const handshake = buildHandshakePacket(PROTOCOL_VERSION, host, port);
  const request = buildRequestPacket();

  // Send via Deno's UDP
  const conn = await Deno.connect({ port, hostname: host, transport: "udp" });

  try {
    // Set read timeout
    const timeoutId = setTimeout(() => {
      conn.close();
    }, TIMEOUT_MS);

    // Send handshake then request
    await conn.send(handshake);
    await conn.send(request);

    // Read response
    const buf = new Uint8Array(1024);
    const { size } = await conn.read(buf);

    clearTimeout(timeoutId);

    const latency_ms = Date.now() - start;

    if (size === 0 || buf[0] !== 0xFF) {
      // Not a valid SLP response
      return { status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "", error: "Invalid response" };
    }

    // Parse SLP response: 0xFF + string16 (JSON data)
    // Skip the 0xFF prefix, read string length (2 bytes big-endian), then JSON
    const stringLen = (buf[1] << 8) | buf[2];
    const jsonBytes = buf.slice(3, 3 + stringLen);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    const data = JSON.parse(jsonStr);

    return {
      status: true,
      latency_ms,
      player_count: data.players?.online ?? 0,
      max_players: data.players?.max ?? 0,
      motd: data.description?.text ?? data.description ?? "",
      version: data.version?.name ?? "",
    };
  } finally {
    conn.close();
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const { ip, port } = await req.json();

  if (!ip) {
    return new Response(JSON.stringify({ error: "ip required" }), { status: 400 });
  }

  const result = await pingServer(ip, port ?? 25565);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Test locally**

Run: `supabase functions serve slp-ping --env-file .env.local`
Expected: Function starts on port 54321

- [ ] **Step 3: Test with curl**

Run: `curl -X POST http://localhost:54321/functions/v1/slp-ping -H "Content-Type: application/json" -d '{"ip": "hypixel.net", "port": 25565}'`
Expected: JSON response with status, latency_ms, player_count, etc.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/slp-ping/index.ts
git commit -m "feat: implement SLP ping protocol in Edge Function"
```

---

## Chunk 2: Status API Route

### Task 2: Next.js API Route for Server Status

**Files:**
- Create: `src/app/api/server/[ip]/route.ts`

- [ ] **Step 1: Write server status API route**

```typescript
// src/app/api/server/[ip]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STALENESS_MINUTES = 10;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const { ip } = await params;
  const url = new URL(req.url);
  const port = parseInt(url.searchParams.get("port") ?? "25565");

  const supabase = createAdminClient();

  // 1. Check if server exists
  const { data: server, error: serverError } = await supabase
    .from("servers")
    .select("id, name, verified, vote_count, version, tags")
    .eq("ip", ip)
    .maybeSingle();

  if (serverError || !server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  // 2. Check if status is fresh
  const { data: status, error: statusError } = await supabase
    .from("server_status")
    .select("*")
    .eq("server_id", server.id)
    .maybeSingle();

  const isStale = !status ||
    new Date(status.last_checked).getTime() < Date.now() - STALENESS_MINUTES * 60 * 1000;

  if (!isStale && status) {
    // Return cached data
    return NextResponse.json({
      server,
      status,
      cached: true,
    });
  }

  // 3. Call Edge Function to ping
  const pingResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/slp-ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ ip, port }),
  });

  const pingData = await pingResponse.json();

  // 4. Update server_status
  await supabase
    .from("server_status")
    .upsert({
      server_id: server.id,
      status: pingData.status ?? false,
      latency_ms: pingData.latency_ms ?? null,
      player_count: pingData.player_count ?? 0,
      max_players: pingData.max_players ?? 0,
      motd: pingData.motd ?? "",
      last_checked: new Date().toISOString(),
    });

  // 5. Get updated status
  const { data: freshStatus } = await supabase
    .from("server_status")
    .select("*")
    .eq("server_id", server.id)
    .single();

  return NextResponse.json({
    server,
    status: freshStatus,
    cached: false,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/server/[ip]/route.ts
git commit -m "feat: add server status API route with staleness-aware caching"
```

---

## Chunk 3: Public API Endpoints

### Task 3: Public v1 API for Server Owners

**Files:**
- Create: `src/app/api/v1/servers/[ip]/status/route.ts`
- Create: `src/app/api/v1/servers/[ip]/badge/route.ts`

- [ ] **Step 1: Write public status endpoint**

```typescript
// src/app/api/v1/servers/[ip]/status/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const { ip } = await params;

  // Parse optional port from IP if included (ip:port format)
  let serverIp = ip;
  let port = 25565;
  if (ip.includes(":")) {
    const [parsedIp, parsedPort] = ip.split(":");
    serverIp = parsedIp;
    port = parseInt(parsedPort);
  }

  const supabase = createAdminClient();

  const { data: server } = await supabase
    .from("servers")
    .select("id, name, vote_count")
    .eq("ip", serverIp)
    .maybeSingle();

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const { data: status } = await supabase
    .from("server_status")
    .select("status, latency_ms, player_count, max_players, last_checked")
    .eq("server_id", server.id)
    .maybeSingle();

  // Get rank (by vote_count)
  const { count: rank } = await supabase
    .from("servers")
    .select("id", { count: "exact", head: true })
    .gt("vote_count", server.vote_count ?? 0);

  return NextResponse.json({
    rank: (rank ?? 0) + 1,
    name: server.name,
    latency_ms: status?.latency_ms ?? null,
    player_count: status?.player_count ?? 0,
    max_players: status?.max_players ?? 0,
    last_checked: status?.last_checked ?? null,
  });
}
```

- [ ] **Step 2: Write SVG badge endpoint**

```typescript
// src/app/api/v1/servers/[ip]/badge/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const { ip } = await params;

  let serverIp = ip;
  if (ip.includes(":")) {
    serverIp = ip.split(":")[0];
  }

  const supabase = createAdminClient();

  const { data: server } = await supabase
    .from("servers")
    .select("name, vote_count")
    .eq("ip", serverIp)
    .maybeSingle();

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const { data: status } = await supabase
    .from("server_status")
    .select("latency_ms")
    .eq("server_id", server.id)
    .maybeSingle();

  const latency = status?.latency_ms ?? 0;
  const color = latency < 50 ? "#22c55e" : latency < 150 ? "#eab308" : "#ef4444";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="24" viewBox="0 0 200 24">
  <rect width="200" height="24" rx="4" fill="#1a1a2e"/>
  <text x="8" y="16" font-family="sans-serif" font-size="12" fill="white">${server.name}</text>
  <text x="160" y="16" font-family="sans-serif" font-size="12" fill="${color}">${latency}ms</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/servers/[ip]/status/route.ts src/app/api/v1/servers/[ip]/badge/route.ts
git commit -m "feat: add public API v1 endpoints for status and SVG badge"
```

---

## Chunk 4: Server List API

### Task 4: Paginated Server List API

**Files:**
- Create: `src/app/api/servers/route.ts`

- [ ] **Step 1: Write servers list endpoint**

```typescript
// src/app/api/servers/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  const sort = url.searchParams.get("sort") ?? "votes";
  const tag = url.searchParams.get("tag");
  const version = url.searchParams.get("version");
  const search = url.searchParams.get("search");

  const offset = (page - 1) * limit;

  let query = supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players, last_checked)
    `, { count: "exact" });

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  if (version) {
    query = query.eq("version", version);
  }

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  // Sort
  if (sort === "votes") {
    query = query.order("vote_count", { ascending: false });
  } else if (sort === "players") {
    query = query.order("player_count", { ascending: false });
  } else if (sort === "latency") {
    query = query.order("latency_ms", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    servers: data,
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/servers/route.ts
git commit -m "feat: add paginated server list API with filtering and sorting"
```

---

**Core Ping System plan complete.**
