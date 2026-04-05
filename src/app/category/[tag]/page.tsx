// src/app/category/[tag]/page.tsx

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { Metadata } from "next";

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

const TAG_LABELS: Record<string, string> = {
  "crystal-pvp": "Crystal PvP Servers",
  "uhc-pvp": "UHC PvP Servers",
  "sumo": "Sumo PvP Servers",
  "nodepuff": "NoDebuff PvP Servers",
  "lifesteal": "Lifesteal Servers",
  "smp": "SMP Servers",
  "practice": "Practice PvP Servers",
  "bridge": "Bridge PvP Servers",
  "hunger-games": "Hunger Games Servers",
  "prison": "Prison Servers",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const label = TAG_LABELS[tag] ?? tag;
  return {
    title: `${label} — PvP Index`,
    description: `Find the best ${label.toLowerCase()}. Real-time latency and player counts.`,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  let servers: ServerWithStatus[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("servers")
      .select(`
        id, ip, port, name, description, version, tags, verified, vote_count,
  icon, banner,
        server_status (status, latency_ms, player_count, max_players)
      `)
      .contains("tags", [tag])
      .order("vote_count", { ascending: false })
      .limit(50);
    servers = (data ?? []) as unknown as ServerWithStatus[];
  } catch (err) {
    console.error("Supabase error:", err);
  }

  const label = TAG_LABELS[tag] ?? tag;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4">
          <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">Back</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">{label}</h1>
        <p className="text-zinc-400 mb-6">
          {servers?.length ?? 0} servers found
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          {servers?.map((server) => (
            <ServerCard key={server.id} server={server as unknown as ServerWithStatus} />
          ))}
        </div>
      </main>
    </div>
  );
}
