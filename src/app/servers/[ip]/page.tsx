// src/app/servers/[ip]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServerStatusPoller } from "@/components/server/ServerStatusPoller";
import { VoteButton } from "@/components/server/VoteButton";
import { JsonLd } from "@/components/seo/JsonLd";

interface ServerStatus {
  status: boolean;
  latency_ms: number | null;
  player_count: number;
  max_players: number;
  motd?: string | null;
  last_checked?: string;
}

export const revalidate = 0;

export default async function ServerPage({
  params,
}: {
  params: Promise<{ ip: string }>;
}) {
  const { ip } = await params;
  const supabase = await createClient();

  const { data: server } = await supabase
    .from("servers")
    .select(`
      id, ip, port, name, description, version, tags, verified, vote_count,
      server_status (status, latency_ms, player_count, max_players, motd, last_checked)
    `)
    .eq("ip", ip)
    .maybeSingle();

  if (!server) notFound();

  const status = server.server_status == null ? null : server.server_status as unknown as ServerStatus;

  const serverJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: server.name,
    applicationCategory: "GameServer",
    operatingSystem: server.version ?? "Minecraft",
    ...(status && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.5",
        ratingCount: server.vote_count,
      },
    }),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <>
      <JsonLd data={serverJsonLd} />
      <div className="min-h-screen">
        <header className="border-b border-zinc-800 py-4">
          <div className="max-w-4xl mx-auto px-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
              Back to list
            </Link>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  {server.name}
                  {server.verified && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                      Verified
                    </span>
                  )}
                </h1>
                <p className="text-zinc-500 font-mono mt-1">
                  {server.ip}:{server.port}
                </p>
              </div>
              <VoteButton serverId={server.id} />
            </div>

            <div className="flex items-center gap-6 mb-4">
              <ServerStatusPoller
                ip={server.ip}
                port={server.port}
                initialStatus={status ?? undefined}
              />
            </div>

            {server.description && (
              <p className="text-zinc-400 mt-4">{server.description}</p>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {server.version && (
                <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">
                  {server.version}
                </span>
              )}
              {server.tags?.map((tag: string) => (
                <span key={tag} className="text-xs bg-purple-900/30 text-purple-300 px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Votes</h2>
            <p className="text-3xl font-bold text-indigo-400">{server.vote_count}</p>
            <p className="text-sm text-zinc-500 mt-1">Total votes received</p>
          </div>
        </main>
      </div>
    </>
  );
}
