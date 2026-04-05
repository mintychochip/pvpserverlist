// src/app/submit/verify/[serverId]/page.tsx

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

interface VerifyServer {
  id: string;
  name: string;
  ip: string;
  port: number;
}

interface VerifyToken {
  token: string;
  expires_at: string;
  verified_at: string | null;
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirect=/submit/verify/" + serverId);
  }

  const adminSupabase = createAdminClient();

  let server: VerifyServer | null = null;
  let token: VerifyToken | null = null;

  try {
    const { data } = await adminSupabase
      .from("servers")
      .select("id, name, ip, port")
      .eq("id", serverId)
      .single();
    server = data as VerifyServer | null;

    if (server) {
      const { data: tokenData } = await adminSupabase
        .from("verification_tokens")
        .select("token, expires_at, verified_at")
        .eq("server_id", serverId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      token = tokenData as VerifyToken | null;
    }
  } catch (err) {
    console.error("Supabase error:", err);
  }

  if (!server || !token) notFound();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-lg w-full">
        <h1 className="text-xl font-bold text-white mb-4">Verify {server.name}</h1>

        {token.verified_at ? (
          <div className="bg-green-900/20 border border-green-800 text-green-400 px-4 py-3 rounded-lg">
            Server verified! Your listing is now live.
          </div>
        ) : (
          <>
            <p className="text-zinc-400 text-sm mb-4">
              Add this token to your server&apos;s MOTD to verify ownership:
            </p>
            <div className="bg-zinc-800 rounded-lg p-4 mb-4">
              <code className="text-indigo-400 font-mono text-lg">{token.token}</code>
            </div>
            <p className="text-zinc-500 text-sm">
              Add <code className="text-zinc-300">PvPIndex: {token.token}</code> to your server MOTD,
              then restart your server. Verification expires in 10 minutes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
