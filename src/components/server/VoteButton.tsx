// src/components/server/VoteButton.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VoteButton({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState(false);

  const handleVote = async () => {
    if (voted || loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId }),
        credentials: "include",
      });

      if (res.ok) {
        setVoted(true);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleVote}
      disabled={voted || loading}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        voted
          ? "bg-green-600 text-white cursor-default"
          : "bg-indigo-600 hover:bg-indigo-500 text-white"
      }`}
    >
      {loading ? "..." : voted ? "Voted!" : "Vote"}
    </button>
  );
}
