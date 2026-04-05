/**
 * Vercel Cron - Watcher
 * Runs every 5 minutes to ping all servers and update their status in Supabase.
 * @see https://vercel.com/docs/cron-jobs
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SECRET_KEY!;

const PROTOCOL_VERSION = 47; // 1.8 protocol - works across all versions
const TIMEOUT_MS = 4000;
const BATCH_SIZE = 50;

// ─── SLP Protocol ───────────────────────────────────────────────────────────

function buildHandshakePacket(protocolVersion: number, serverAddress: string, serverPort: number): Buffer {
  const addrBytes = Buffer.from(serverAddress, "utf8");
  const packet = Buffer.alloc(1 + varintLen(protocolVersion) + varintLen(addrBytes.length) + addrBytes.length + 2 + varintLen(1));
  let offset = 0;
  packet.writeUInt8(0x00, offset++);
  offset = writeVarint(packet, offset, protocolVersion);
  offset = writeVarint(packet, offset, addrBytes.length);
  addrBytes.copy(packet, offset);
  offset += addrBytes.length;
  packet.writeUInt16LE(serverPort, offset);
  offset += 2;
  writeVarint(packet, offset, 1);
  return packet;
}

function buildRequestPacket(): Buffer {
  return Buffer.from([0xFE, 0x01]);
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

// ─── Supabase ───────────────────────────────────────────────────────────────

interface Server {
  id: string;
  ip: string;
  port: number;
  name: string;
}

async function fetchAllServers(supabase: any): Promise<Server[]> {
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

async function upsertServerStatus(supabase: any,
  serverId: string,
  status: boolean,
  latencyMs: number | null,
  playerCount: number,
  maxPlayers: number,
  motd: string,
  version: string
): Promise<void> {
  await supabase.from("server_status").upsert(
    {
      server_id: serverId,
      status,
      latency_ms: latencyMs,
      player_count: playerCount,
      max_players: maxPlayers,
      motd,
      version,
      last_checked: new Date().toISOString(),
    } as never,
    { onConflict: "server_id" }
  );
}

// ─── Serverless-compatible ping using dgram ─────────────────────────────────

async function pingServer(ip: string, port: number): Promise<{ status: boolean; latency_ms: number | null; player_count: number; max_players: number; motd: string; version: string }> {
  const dgram = await import("dgram");
  const start = Date.now();

  return new Promise((resolve) => {
    const udp = dgram.createSocket("udp4");
    let resolved = false;

    const doResolve = (result: { status: boolean; latency_ms: number | null; player_count: number; max_players: number; motd: string; version: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try { udp.close(); } catch { /* ignore */ }
      resolve(result);
    };

    const timeout = setTimeout(() => {
      doResolve({ status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "" });
    }, TIMEOUT_MS);

    udp.on("error", () => {
      doResolve({ status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "" });
    });

    udp.on("message", (buf: Buffer) => {
      if (resolved) return;

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

// ─── Cron Handler ───────────────────────────────────────────────────────────

export async function GET() {
  console.log(`[${new Date().toISOString()}] Watcher cron: starting...`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const servers = await fetchAllServers(supabase);
    console.log(`Watcher: found ${servers.length} servers to ping`);

    let online = 0, offline = 0;
    const errors: string[] = [];

    for (let i = 0; i < servers.length; i += BATCH_SIZE) {
      const batch = servers.slice(i, i + BATCH_SIZE);

      try {
        const results = await Promise.all(
          batch.map((s) => pingServer(s.ip, s.port).then((r) => ({ server: s, result: r })))
        );

        await Promise.all(
          results.map(({ server, result }) =>
            Promise.resolve().then(() => {
              // Increment counters based on ping result, not DB write result
              if (result.status) online++;
              else offline++;
              return upsertServerStatus(
                supabase,
                server.id,
                result.status,
                result.latency_ms,
                result.player_count,
                result.max_players,
                result.motd,
                result.version
              );
            }).then(async () => {
              // Sync server-reported version and last_online_at when online
              if (result.status) {
                const update: Record<string, unknown> = {
                  last_online_at: new Date().toISOString(),
                };
                if (result.version && result.version.trim() !== "") {
                  update.version = result.version;
                }
                await supabase
                  .from("servers")
                  .update(update)
                  .eq("id", server.id);
                console.log(`  ✓ ${server.name} (${server.ip}) — ${result.player_count}/${result.max_players} players, ${result.latency_ms}ms`);
              } else {
                console.log(`  ✗ ${server.name} (${server.ip}) — offline`);
              }
            }).catch((err) => {
              errors.push(`Failed to upsert ${server.name}: ${err}`);
            })
          )
        );
      } catch (err) {
        errors.push(`Batch ${i / BATCH_SIZE} failed: ${err}`);
      }
    }

    console.log(`[${new Date().toISOString()}] Watcher: done. Online=${online}, Offline=${offline}`);

    if (errors.length > 0) {
      console.log(`Errors: ${errors.join(", ")}`);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      servers: servers.length,
      online,
      offline,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Watcher cron failed:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}