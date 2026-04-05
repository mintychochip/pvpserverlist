// src/app/api/vote/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
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

  const forwarded = req.headers.get("x-forwarded-for");
  const visitorIp = forwarded?.split(",")[0]?.trim() ?? "unknown";

  const supabase = createAdminClient();

  const { count } = await supabase
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("server_id", serverId)
    .eq("visitor_ip", visitorIp)
    .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (count && count > 0) {
    return NextResponse.json({ error: "You can only vote once every 24 hours" }, { status: 429 });
  }

  const { error } = await supabase.from("votes").insert({
    server_id: serverId,
    visitor_ip: visitorIp,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.rpc("increment_vote_count", { server_id: serverId });

  return NextResponse.json({ success: true });
}
