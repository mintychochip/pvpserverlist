// src/app/servers/[id]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServerStatusPoller } from "@/components/server/ServerStatusPoller";
import { VoteButton } from "@/components/server/VoteButton";
import { JsonLd } from "@/components/seo/JsonLd";
import { AdBanner } from "@/components/ads/AdBanner";
import { Metadata } from "next";

interface ServerStatus {
  status: boolean;
  latency_ms: number | null;
  player_count: number;
  max_players: number;
  motd?: string | null;
  last_checked?: string;
}

interface ServerDetail {
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
  server_status?: ServerStatus | null;
}

export const revalidate = 0;

async function findServer(supabase: Awaited<ReturnType<typeof createClient>>, id: string, select: string) {
  // Try by ID first
  const { data } = await supabase
    .from("servers")
    .select(select)
    .eq("id", id)
    .maybeSingle();
  if (data) return data;

  // Fallback: try by IP (for old bookmarks)
  const { data: byIp } = await supabase
    .from("servers")
    .select(select)
    .eq("ip", id)
    .maybeSingle();
  return byIp;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  let server: ServerDetail | null = null;
  try {
    const supabase = await createClient();
    server = await findServer(supabase, id, `name, description, version, ip, port`) as ServerDetail | null;
  } catch (err) {
    console.error("Supabase error:", err);
  }

  if (!server) {
    return { title: "Server Not Found" };
  }

  return {
    title: `${server.name} — PvP Index`,
    description: server.description ?? `Join ${server.name} on ${server.ip}:${server.port}. ${server.version ?? "Minecraft"} server with real-time status.`,
  };
}

export default async function ServerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let server: ServerDetail | null = null;
  try {
    const supabase = await createClient();
    server = await findServer(supabase, id, `
      id, ip, port, name, description, version, tags, verified, vote_count,
      icon, banner,
      server_status (status, latency_ms, player_count, max_players, motd, last_checked)
    `) as ServerDetail | null;
  } catch (err) {
    console.error("Supabase error:", err);
  }

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

        <div className="grid" style={{ gridTemplateColumns: '1fr minmax(0, 1152px) 1fr' }}>
          <div className="hidden xl:flex xl:justify-end xl:pr-4 xl:sticky xl:top-4 xl:self-start xl:pt-8">
            <AdBanner slot="skyscraper" />
          </div>

          <div>
            <main className="px-4 py-8">
              <AdBanner slot="leaderboard" className="mb-6" />

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

          <div className="hidden xl:flex xl:pl-4 xl:sticky xl:top-4 xl:self-start xl:pt-8">
            <AdBanner slot="skyscraper" />
          </div>
        </div>
      </div>
    </>
  );
}
