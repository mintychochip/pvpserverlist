// src/app/top/page.tsx

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { Metadata } from "next";

interface ServerWithStatus {
  id: string;
  ip: string;
  port: number;
  name: string;
  description: string | null;
  version: string | null;
  tags: string[];
  verified: boolean;
  vote_count: number;
  server_status?: {
    status: boolean;
    latency_ms: number | null;
    player_count: number;
    max_players: number;
  } | null;
}

export const metadata: Metadata = {
  title: "Top Servers — PvP Index",
  description: "Highest ranked Minecraft PvP servers by votes.",
};

export default async function TopPage() {
  const supabase = await createClient();

  const { data: servers } = await supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players)
    `)
    .order("vote_count", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4">
          <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">Back</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">Top Servers</h1>
        <p className="text-zinc-400 mb-6">Ranked by community votes.</p>

        <div className="space-y-2">
          {servers?.map((server, i) => (
            <div key={server.id} className="flex items-center gap-4">
              <span className="text-2xl font-bold text-zinc-600 w-8 text-right">
                {i + 1}
              </span>
              <div className="flex-1">
                <ServerCard server={server as unknown as ServerWithStatus} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
