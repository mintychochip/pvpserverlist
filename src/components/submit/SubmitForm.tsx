// src/components/submit/SubmitForm.tsx

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TAG_OPTIONS = [
  "crystal-pvp", "uhc-pvp", "sumo", "nodepuff", "lifesteal",
  "smp", "practice", "bridge", "hunger-games", "prison"
];

export function SubmitForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    ip: "",
    port: "25565",
    name: "",
    description: "",
    version: "",
    tags: [] as string[],
  });

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login?redirect=/submit");
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Submission failed");
        return;
      }

      router.push(`/submit/verify/${data.serverId}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter((t) => t !== tag)
        : [...f.tags, tag],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Server IP *</label>
        <input
          type="text"
          required
          placeholder="play.example.com"
          value={form.ip}
          onChange={(e) => setForm({ ...form, ip: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Port</label>
        <input
          type="number"
          placeholder="25565"
          value={form.port}
          onChange={(e) => setForm({ ...form, port: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Server Name *</label>
        <input
          type="text"
          required
          placeholder="My Awesome PvP Server"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
        <textarea
          rows={3}
          placeholder="What makes your server special..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Version</label>
        <input
          type="text"
          placeholder="1.20.4"
          value={form.version}
          onChange={(e) => setForm({ ...form, version: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Tags</label>
        <div className="flex flex-wrap gap-2">
          {TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                form.tags.includes(tag)
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium py-2 rounded-lg transition-colors"
      >
        {loading ? "Submitting..." : "Submit Server"}
      </button>
    </form>
  );
}
