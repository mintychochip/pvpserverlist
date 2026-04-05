/**
 * PvP Index Watcher
 * Fetches all servers from Supabase, pings them via SLP, updates server_status.
 * Run via: npm start
 */

import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const PROTOCOL_VERSION = 47; // 1.8 protocol - works across all versions
const TIMEOUT_MS = 4000;
const BATCH_SIZE = 50; // ping this many servers concurrently

interface Server {
  id: string;
  ip: string;
  port: number;
  name: string;
}

interface PingResult {
  id: string;
  status: boolean;
  latency_ms: number | null;
  player_count: number;
  max_players: number;
  motd: string;
  version: string;
}

// ─── SLP Protocol ───────────────────────────────────────────────────────────

function buildHandshakePacket(protocolVersion: number, serverAddress: string, serverPort: number): Buffer {
  const addrBytes = Buffer.from(serverAddress, "utf8");
  // Packet: 0x00 (handshake id) + protocol verint + address (string) + port (2 bytes) + state varint
  const packet = Buffer.alloc(1 + varintLen(protocolVersion) + varintLen(addrBytes.length) + addrBytes.length + 2 + varintLen(1));
  let offset = 0;
  packet.writeUInt8(0x00, offset++);
  offset = writeVarint(packet, offset, protocolVersion);
  offset = writeVarint(packet, offset, addrBytes.length);
  addrBytes.copy(packet, offset);
  offset += addrBytes.length;
  packet.writeUInt16LE(serverPort, offset);
  offset += 2;
  writeVarint(packet, offset, 1); // status state
  return packet;
}

function buildRequestPacket(): Buffer {
  return Buffer.from([0xFE, 0x01]); // Status request packet
}

function varintLen(value: number): number {
  let len = 0;
  while (value > 0x7f) { len++; value >>= 7; }
  return len + 1;
}

function writeVarint(buf: Buffer, offset: number, value: number): number {
  while (value > 0x7f) {
    buf.writeUInt8((value & 0x7f) | 0x80, offset++);
    value >>= 7;
  }
  buf.writeUInt8(value & 0x7f, offset++);
  return offset;
}

function readVarint(buf: Buffer, offset: number): { value: number; newOffset: number } {
  let result = 0, shift = 0;
  while (true) {
    const b = buf.readUInt8(offset++);
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, newOffset: offset };
}

async function pingServer(ip: string, port: number): Promise<Omit<PingResult, "id">> {
  const start = Date.now();

  return new Promise((resolve) => {
    const udp = require("dgram").createSocket("udp4");
    let resolved = false;
    let timedOut = false;

    const cleanup = () => {
      if (!timedOut) { timedOut = true; }
      try { udp.close(); } catch {}
    };

    const doResolve = (result: Omit<PingResult, "id">) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      doResolve({ status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "" });
    }, TIMEOUT_MS);

    udp.on("error", (err: Error) => {
      doResolve({ status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "" });
    });

    udp.on("message", (buf: Buffer) => {
      if (resolved || timedOut) return;

      const latency_ms = Date.now() - start;

      if (buf.length < 3 || buf[0] !== 0xff) {
        doResolve({ status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "" });
        return;
      }

      try {
        const jsonLen = buf.readUInt16BE(1);
        const jsonStr = buf.slice(3, 3 + jsonLen).toString("utf8");
        const data = JSON.parse(jsonStr);

        doResolve({
          status: true,
          latency_ms,
          player_count: data.players?.online ?? 0,
          max_players: data.players?.max ?? 0,
          motd: data.description?.text ?? data.description ?? "",
          version: data.version?.name ?? "",
        });
      } catch {
        doResolve({ status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "" });
      }
    });

    udp.send(buildHandshakePacket(PROTOCOL_VERSION, ip, port), port, ip, (err: Error | null) => {
      if (err) { doResolve({ status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "" }); return; }
      udp.send(buildRequestPacket(), port, ip, () => {});
    });
  });
}

// ─── Supabase ───────────────────────────────────────────────────────────────

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

async function fetchAllServers(supabase: SupabaseClient): Promise<Server[]> {
  const servers: Server[] = [];
  let page: Server[] = [];
  let offset = 0;

  do {
    const { data } = await supabase
      .from("servers")
      .select("id, ip, port, name")
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);

    page = (data as Server[]) ?? [];
    servers.push(...page);
    offset += 1000;
  } while (page.length === 1000);

  return servers;
}

async function upsertServerStatus(
  supabase: SupabaseClient,
  serverId: string,
  status: boolean,
  latencyMs: number | null,
  playerCount: number,
  maxPlayers: number,
  motd: string
): Promise<void> {
  await supabase.from("server_status").upsert(
    {
      server_id: serverId,
      status,
      latency_ms: latencyMs,
      player_count: playerCount,
      max_players: maxPlayers,
      motd,
      last_checked: new Date().toISOString(),
    },
    { onConflict: "server_id" }
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${new Date().toISOString()}] Watcher: starting...`);

  const supabase = getSupabase();
  const servers = await fetchAllServers(supabase);
  console.log(`Watcher: found ${servers.length} servers to ping`);

  let online = 0, offline = 0;

  // Ping in batches to avoid hammering the network
  for (let i = 0; i < servers.length; i += BATCH_SIZE) {
    const batch = servers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((s) => pingServer(s.ip, s.port).then((r) => ({ server: s, result: r })))
    );

    await Promise.all(
      results.map(({ server, result }) =>
        upsertServerStatus(
          supabase,
          server.id,
          result.status,
          result.latency_ms,
          result.player_count,
          result.max_players,
          result.motd
        ).then(() => {
          if (result.status) {
            online++;
            console.log(`  ✓ ${server.name} (${server.ip}) — ${result.player_count}/${result.max_players} players, ${result.latency_ms}ms`);
          } else {
            offline++;
            console.log(`  ✗ ${server.name} (${server.ip}) — offline`);
          }
        })
      )
    );
  }

  console.log(`[${new Date().toISOString()}] Watcher: done. Online=${online}, Offline=${offline}`);
}

main().catch(console.error);
