import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardServerCard } from "@/components/dashboard/DashboardServerCard";
import { Plus } from "lucide-react";

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
  icon: string | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: servers } = await supabase
    .from("servers")
    .select("id, ip, port, name, description, version, tags, verified, vote_count, icon")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const serversList = (servers ?? []) as unknown as ServerWithStatus[];

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-white">PvP Index</Link>
          <nav className="flex gap-4">
            <Link href="/top" className="text-sm text-zinc-400 hover:text-white transition-colors">Top Servers</Link>
            <Link href="/submit" className="text-sm text-zinc-400 hover:text-white transition-colors">Submit</Link>
            <Link href="/dashboard" className="text-sm text-white font-medium">Dashboard</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">My Servers</h1>
            <p className="text-zinc-400">
              {serversList.length} server{serversList.length !== 1 ? "s" : ""} in your dashboard
            </p>
          </div>
          <Link
            href="/submit"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </Link>
        </div>

        {serversList.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {serversList.map((server) => (
              <DashboardServerCard key={server.id} server={server} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <p className="text-zinc-500 mb-4">You have not added any servers yet.</p>
            <Link
              href="/submit"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Your First Server
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
