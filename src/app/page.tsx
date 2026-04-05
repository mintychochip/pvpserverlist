// src/app/page.tsx

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ServerCard } from "@/components/server/ServerCard";
import { FilterBar } from "@/components/server/FilterBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { AdBanner } from "@/components/ads/AdBanner";
import { ContactForm } from "@/components/ui/ContactForm";
import { Header } from "@/components/layout/Header";

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
  last_online_at: string | null;
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
  searchParams: Promise<{ page?: string; sort?: string; tag?: string; version?: string; search?: string; layout?: string; max_offline_hours?: string; show_offline?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const sort = params.sort ?? "votes";
  const tag = params.tag;
  const version = params.version;
  const search = params.search;
  const layout = params.layout ?? "grid";
  const hideOffline = params.max_offline_hours === "24";
  const showOffline = params.show_offline === "true";
  const maxOfflineHours = parseInt(params.max_offline_hours ?? "0");
  const limit = 20;
  const offset = (page - 1) * limit;

  let servers: ServerWithStatus[] = [];
  let count = 0;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("servers")
      .select(`
        id, ip, port, name, description, version, tags, verified, vote_count, icon, banner,
        server_status (status, latency_ms, player_count, max_players, last_checked)
      `, { count: "exact" });

    if (tag) query = query.contains("tags", [tag]);
    if (version) query = query.eq("version", version);
    if (search) query = query.ilike("name", `%${search}%`);

    // Filter by offline duration
    if (maxOfflineHours > 0) {
      const cutoff = new Date(Date.now() - maxOfflineHours * 60 * 60 * 1000).toISOString();
      if (showOffline) {
        query = query.lt("last_online_at", cutoff).not("last_online_at", "is", null);
      } else {
        query = query.or(`last_online_at.gte.${cutoff},last_online_at.is.null`);
      }
    }

    if (sort === "votes") query = query.order("vote_count", { ascending: false });
    else if (sort === "players") query = query.order("player_count", { ascending: false });
    else if (sort === "latency") query = query.order("latency_ms", { ascending: true, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });

    query = query.range(offset, offset + limit - 1);

    const { data, count: serverCount } = await query;
    servers = (data ?? []) as unknown as ServerWithStatus[];
    count = serverCount ?? 0;
  } catch (err) {
    // Supabase not configured — show empty list
    console.error("Supabase error:", err);
  }
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
        <Header />

        <div className="grid" style={{ gridTemplateColumns: '1fr minmax(0, 1152px) 1fr' }}>
          <div className="hidden xl:flex xl:justify-end xl:pr-4 xl:sticky xl:top-4 xl:self-start xl:pt-8">
            <AdBanner slot="skyscraper" />
          </div>

          <div>
            <main className="px-4 py-8">
              <div className="mb-8">
                {/* Determine heading based on tab */}
                {(() => {
                  const heading = showOffline
                    ? "Recently Offline Servers"
                    : "Best Minecraft PvP Servers";
                  return (
                    <h2 className="text-3xl font-bold text-white mb-2">
                      {heading}
                    </h2>
                  );
                })()}
                <p className="text-zinc-400">
                  Real-time latency checks. Ranked by performance. Updated daily.
                </p>
              </div>

              <div className="mb-6">
                <FilterBar />
              </div>

              <div className="mb-6">
                <AdBanner slot="leaderboard" />
              </div>

              <div className={layout === "grid"
                ? "grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                : "grid gap-4 grid-cols-1"
              }>
                {servers?.map((server) => (
                  <ServerCard key={server.id} server={server} />
                ))}

                {servers?.length === 0 && (
                  <div className="text-center py-12 text-zinc-500 col-span-full">
                    No servers found. <Link href="/submit" className="text-indigo-400 hover:underline">Submit one!</Link>
                  </div>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  {(() => {
                    const buildPaginationParams = (pageNum: number) => {
                      const paginationParams = new URLSearchParams();
                      paginationParams.set("page", String(pageNum));
                      paginationParams.set("sort", sort);
                      if (tag) paginationParams.set("tag", tag);
                      if (version) paginationParams.set("version", version);
                      if (search) paginationParams.set("search", search);
                      if (maxOfflineHours > 0) paginationParams.set("max_offline_hours", String(maxOfflineHours));
                      if (showOffline) paginationParams.set("show_offline", "true");
                      if (layout !== "grid") paginationParams.set("layout", layout);
                      return paginationParams.toString();
                    };
                    return (
                      <>
                        {page > 1 && (
                          <Link href={`/?${buildPaginationParams(page - 1)}`}
                             className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm">
                            Previous
                          </Link>
                        )}
                        <span className="px-4 py-2 text-zinc-500 text-sm">
                          Page {page} of {totalPages}
                        </span>
                        {page < totalPages && (
                          <Link href={`/?${buildPaginationParams(page + 1)}`}
                             className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm">
                            Next
                          </Link>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </main>
          </div>

          <div className="hidden xl:flex xl:pl-4 xl:sticky xl:top-4 xl:self-start xl:pt-8">
            <AdBanner slot="skyscraper" />
          </div>
        </div>

        <footer className="border-t border-zinc-800 py-12 mt-12">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-semibold mb-2">What is PvP Index?</h3>
                <p className="text-zinc-400 text-sm">PvP Index is a Minecraft server list website created to help players find the best PvP servers. With multiple filters, ordered lists, categories, and real-time server status, finding your ideal server is easier than ever.</p>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">Who lists the servers?</h3>
                <p className="text-zinc-400 text-sm">Most servers are posted by their owners. We fill out and correct any missing or inaccurate info to ensure only quality servers are listed. A small selection have been posted by us to provide a wider array of options.</p>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">What are the requirements to list a server?</h3>
                <p className="text-zinc-400 text-sm">We allow all sorts of servers as long as they are of good quality and follow our TOS guidelines. We do not allow servers hosted on Aternos or Minehut.</p>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">Do you support Voting?</h3>
                <p className="text-zinc-400 text-sm">Absolutely! Voting and Votifier are 100% supported — though not all servers are Votifier-enabled. You can vote once every 24 hours and optionally leave a review. Voting through VPN or Proxy is not allowed. Votes over 15 days old are deleted to keep results fresh.</p>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">How can I contact you?</h3>
                <p className="text-zinc-400 text-sm">You can reach out via email at <a href="mailto:info@pvpserverlist.com" className="text-indigo-400 hover:underline">info@pvpserverlist.com</a>, or message us via Discord or Twitter. You can also use the contact form below.</p>
              </div>
            </div>
            <ContactForm />
            <div className="mt-10 pt-6 border-t border-zinc-800 text-center text-zinc-600 text-sm">
              PvP Index — Real-time Minecraft server status
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
