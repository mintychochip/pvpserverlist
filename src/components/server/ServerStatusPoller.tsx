// src/components/server/ServerStatusPoller.tsx

"use client";

import { useEffect, useState } from "react";

interface ServerStatus {
  status: boolean;
  latency_ms: number | null;
  player_count: number;
  max_players: number;
}

export function ServerStatusPoller({ ip, port, initialStatus }: {
  ip: string;
  port: number;
  initialStatus?: ServerStatus;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/server/${ip}?port=${port}`);
        const data = await res.json();
        setStatus(data.status);
      } catch {
        // Ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [ip, port]);

  if (!status) return null;

  const pingColor = !status.latency_ms
    ? "text-zinc-500"
    : status.latency_ms < 50
    ? "text-green-400"
    : status.latency_ms < 150
    ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="flex items-center gap-4">
      <span className={pingColor}>
        {status.latency_ms !== null ? `${status.latency_ms}ms` : "—"}
      </span>
      <span className="text-zinc-400">
        {status.status ? (
          <span className="text-green-400">{status.player_count}/{status.max_players} players</span>
        ) : (
          <span className="text-zinc-500">Offline</span>
        )}
      </span>
    </div>
  );
}
