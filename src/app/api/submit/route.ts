// src/app/api/submit/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ip, port, name, description, version, tags } = body;

  if (!ip || !name) {
    return NextResponse.json({ error: "IP and name are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: server, error } = await supabase
    .from("servers")
    .insert({
      ip,
      port: parseInt(port ?? "25565"),
      name,
      description: description ?? null,
      version: version ?? null,
      tags: tags ?? [],
      owner_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  await supabase.from("verification_tokens").insert({
    server_id: server.id,
    token,
    motd_pattern: `PvPIndex: ${token}`,
  });

  return NextResponse.json({ serverId: server.id, token });
}
