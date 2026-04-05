// src/components/server/ServerCard.tsx

"use client";

import { cn } from "@/lib/utils";
import { Server, Vote, WifiOff } from "lucide-react";

interface ServerCardProps {
  server: {
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
    } | null;
  };
  onVote?: (serverId: string) => void;
}

function PingBadge({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  const color = ms < 50 ? "text-green-400" : ms < 150 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={cn("flex items-center gap-1 text-xs font-mono", color)}>
      {ms}ms
    </span>
  );
}

export function ServerCard({ server, onVote }: ServerCardProps) {
  const { status, latency_ms, player_count, max_players } = server.server_status ?? {};
  const isOnline = status === true;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
            {isOnline ? (
              <Server className="w-5 h-5 text-green-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-zinc-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              {server.name}
              {server.verified && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                  Verified
                </span>
              )}
            </h3>
            <p className="text-xs text-zinc-500 font-mono">
              {server.ip}:{server.port}
            </p>
          </div>
        </div>

        <div className="text-right">
          {latency_ms !== undefined && latency_ms !== null ? (
            <PingBadge ms={latency_ms} />
          ) : (
            <span className="text-xs text-zinc-600">-</span>
          )}
        </div>
      </div>

      {server.description && (
        <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
          {server.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        {server.version && (
          <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
            {server.version}
          </span>
        )}
        {server.tags?.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
        <div className="text-sm">
          {isOnline ? (
            <span className="text-green-400">
              {player_count}/{max_players} online
            </span>
          ) : (
            <span className="text-zinc-500">Offline</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Vote className="w-3 h-3" />
            {server.vote_count}
          </span>
          <button
            onClick={() => onVote?.(server.id)}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Vote
          </button>
        </div>
      </div>
    </div>
  );
}
