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