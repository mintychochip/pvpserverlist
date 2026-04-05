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
  const maxOfflineHours = parseInt(url.searchParams.get("max_offline_hours") ?? "0");
  const showOffline = url.searchParams.get("show_offline") === "true";

  const offset = (page - 1) * limit;

  let query = supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count, icon, banner,
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

  // Filter by offline duration
  if (maxOfflineHours > 0) {
    const cutoff = new Date(Date.now() - maxOfflineHours * 60 * 60 * 1000).toISOString();
    if (showOffline) {
      // Show servers that ARE offline but within the window
      query = query.lt("last_online_at", cutoff).not("last_online_at", "is", null);
    } else {
      // Hide servers offline longer than cutoff (include servers never checked)
      query = query.or(`last_online_at.gte.${cutoff},last_online_at.is.null`);
    }
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