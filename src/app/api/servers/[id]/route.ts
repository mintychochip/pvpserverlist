import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: server } = await supabase
    .from("servers").select("owner_id").eq("id", id).single();

  if (!server || server.owner_id !== user.id) {
    return NextResponse.json({ error: "Not your server" }, { status: 403 });
  }

  const { name, description, version, tags } = body;
  const { data, error } = await supabase
    .from("servers").update({ name, description, version, tags }).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: server } = await supabase
    .from("servers").select("owner_id").eq("id", id).single();

  if (!server || server.owner_id !== user.id) {
    return NextResponse.json({ error: "Not your server" }, { status: 403 });
  }

  const { error } = await supabase.from("servers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
