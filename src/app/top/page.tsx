// src/app/top/page.tsx

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { Metadata } from "next";
import { AdBanner } from "@/components/ads/AdBanner";

export const dynamic = "force-dynamic";

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
  banner: string | null;
  icon: string | null;
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
  let servers: ServerWithStatus[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("servers")
      .select(`
        id, ip, port, name, description, version, tags, verified, vote_count, icon, banner,
        server_status (status, latency_ms, player_count, max_players)
      `)
      .order("vote_count", { ascending: false })
      .limit(100);
    servers = (data ?? []) as unknown as ServerWithStatus[];
  } catch (err) {
    console.error("Supabase error:", err);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4">
          <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">Back</Link>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: '1fr minmax(0, 1152px) 1fr' }}>
        <div className="hidden xl:flex xl:justify-end xl:pr-4 xl:sticky xl:top-4 xl:self-start xl:pt-8">
          <AdBanner slot="skyscraper" />
        </div>

        <div>
          <main className="px-4 py-8">
            <AdBanner slot="leaderboard" className="mb-6" />

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

        <div className="hidden xl:flex xl:pl-4 xl:sticky xl:top-4 xl:self-start xl:pt-8">
          <AdBanner slot="skyscraper" />
        </div>
      </div>
    </div>
  );
}
