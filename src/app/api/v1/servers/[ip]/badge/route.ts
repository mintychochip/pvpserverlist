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