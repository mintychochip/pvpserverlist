// src/app/page.tsx

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { FilterBar } from "@/components/server/FilterBar";
import { JsonLd } from "@/components/seo/JsonLd";

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
    last_checked?: string;
  } | null;
}

export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; tag?: string; version?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const sort = params.sort ?? "votes";
  const tag = params.tag;
  const version = params.version;
  const search = params.search;
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  let query = supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players, last_checked)
    `, { count: "exact" });

  if (tag) query = query.contains("tags", [tag]);
  if (version) query = query.eq("version", version);
  if (search) query = query.ilike("name", `%${search}%`);

  if (sort === "votes") query = query.order("vote_count", { ascending: false });
  else if (sort === "players") query = query.order("player_count", { ascending: false });
  else if (sort === "latency") query = query.order("latency_ms", { ascending: true, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });

  query = query.range(offset, offset + limit - 1);

  const { data: servers, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / limit);

  const serversListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Best Minecraft PvP Servers 2026",
    itemListElement: servers?.map((server, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SoftwareApplication",
        name: server.name,
        applicationCategory: "GameServer",
        operatingSystem: server.version ?? "Minecraft",
        ...(server.server_status && {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.5",
            ratingCount: server.vote_count,
          },
        }),
      },
    })),
  };

  return (
    <>
      <JsonLd data={serversListJsonLd} />
      <div className="min-h-screen">
        <header className="border-b border-zinc-800 py-4">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">PvP Index</h1>
            <nav className="flex gap-4">
              <Link href="/top" className="text-sm text-zinc-400 hover:text-white transition-colors">Top Servers</Link>
              <Link href="/submit" className="text-sm text-zinc-400 hover:text-white transition-colors">Submit</Link>
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              Best Minecraft PvP Servers
            </h2>
            <p className="text-zinc-400">
              Real-time latency checks. Ranked by performance. Updated daily.
            </p>
          </div>

          <div className="mb-6">
            <FilterBar />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            {servers?.map((server) => (
              <ServerCard key={server.id} server={server as unknown as ServerWithStatus} />
            ))}

            {servers?.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No servers found. <Link href="/submit" className="text-indigo-400 hover:underline">Submit one!</Link>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {page > 1 && (
                <Link href={`/?page=${page - 1}&sort=${sort}${tag ? `&tag=${tag}` : ""}${version ? `&version=${version}` : ""}`}
                   className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm">
                  Previous
                </Link>
              )}
              <span className="px-4 py-2 text-zinc-500 text-sm">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link href={`/?page=${page + 1}&sort=${sort}${tag ? `&tag=${tag}` : ""}${version ? `&version=${version}` : ""}`}
                   className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm">
                  Next
                </Link>
              )}
            </div>
          )}
        </main>

        <footer className="border-t border-zinc-800 py-6 mt-12">
          <div className="max-w-6xl mx-auto px-4 text-center text-zinc-600 text-sm">
            PvP Index — Real-time Minecraft server status
          </div>
        </footer>
      </div>
    </>
  );
}
