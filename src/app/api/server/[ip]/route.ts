// src/app/api/server/[ip]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const { ip } = await params;

  const supabase = createAdminClient();

  // Find server by IP
  const { data: server } = await supabase
    .from("servers")
    .select("id, ip, port")
    .eq("ip", ip)
    .maybeSingle();

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  // Get cached status
  const { data: status } = await supabase
    .from("server_status")
    .select("*")
    .eq("server_id", server.id)
    .maybeSingle();

  // Check if stale (older than 10 minutes)
  const lastChecked = new Date(status?.last_checked ?? 0);
  const now = new Date();
  const isStale = now.getTime() - lastChecked.getTime() > 10 * 60 * 1000;

  // If stale, trigger a refresh via Edge Function
  if (isStale && server.port) {
    try {
      const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/slp-ping`;
      const response = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ ip: server.ip, port: server.port }),
      });

      if (response.ok) {
        const pingData = await response.json();

        // Upsert fresh results to server_status
        await supabase.from("server_status").upsert({
          server_id: server.id,
          status: pingData.status ?? false,
          latency_ms: pingData.latency_ms ?? null,
          player_count: pingData.player_count ?? 0,
          max_players: pingData.max_players ?? 0,
          motd: pingData.motd ?? "",
          last_checked: new Date().toISOString(),
        });

        // Return fresh data
        return NextResponse.json({
          status: {
            status: pingData.status ?? false,
            latency_ms: pingData.latency_ms ?? null,
            player_count: pingData.player_count ?? 0,
            max_players: pingData.max_players ?? 0,
          },
        });
      }
    } catch {
      // Network error — fall through to return cached data
    }
  }

  // Return cached data (fresh or stale, or null if no status exists)
  return NextResponse.json({
    status: status
      ? {
          status: status.status,
          latency_ms: status.latency_ms,
          player_count: status.player_count,
          max_players: status.max_players,
        }
      : null,
  });
}
