"use client";

import Link from "next/link";
import { UserMenu } from "@/components/auth/UserMenu";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

export function Header() {
  const [user, setUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUser(data.user ? { id: data.user.id } : null);
    });
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_, session) => {
      setUser(session?.user ? { id: session.user.id } : null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="border-b border-zinc-800 py-4">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-white">PvP Index</Link>
        <nav className="flex gap-4 items-center">
          <Link href="/top" className="text-sm text-zinc-400 hover:text-white transition-colors">Top Servers</Link>
          {user ? (
            <UserMenu />
          ) : (
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Login</Link>
          )}
          <Link
            href="/submit"
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Your Server
          </Link>
        </nav>
      </div>
    </header>
  );
}