// src/components/server/ServerCard.tsx

"use client";

import Link from "next/link";
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
    icon: string | null;
    banner: string | null;
    server_status?: {
      status: boolean;
      latency_ms: number | null;
      player_count: number;
      max_players: number;
      last_checked?: string;
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

function LastChecked({ time }: { time?: string }) {
  if (!time) return null;
  const date = new Date(time);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  let label: string;
  if (diffMins < 1) label = "just now";
  else if (diffMins < 60) label = `${diffMins}m ago`;
  else if (diffMins < 1440) label = `${Math.floor(diffMins / 60)}h ago`;
  else label = date.toLocaleDateString();

  return (
    <span className="text-xs text-zinc-600" title={date.toLocaleString()}>
      checked {label}
    </span>
  );
}

export function ServerCard({ server, onVote }: ServerCardProps) {
  const { status, latency_ms, player_count, max_players, last_checked } = server.server_status ?? {};
  const isOnline = status === true;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
<<<<<<< Updated upstream
      <Link href={`/servers/${server.id}`} className="block">
        {server.banner && (
          <div className="w-full aspect-[2.87/1] overflow-hidden bg-zinc-800">
            {server.banner.endsWith('.mp4') ? (
              <video
                src={server.banner}
                className="w-full h-full object-cover"
                muted
                autoPlay
                loop
                playsInline
                onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
              />
=======
      {server.banner && (
        <div className="w-full h-24 md:h-28 overflow-hidden bg-zinc-800">
          {server.banner.endsWith('.mp4') ? (
            <video
              src={server.banner}
              className="w-full h-full object-cover"
              muted={true}
              autoPlay={true}
              loop={true}
              playsInline
              onLoadedData={(e) => { try { (e.target as HTMLVideoElement).play(); } catch(_e) {} }}
            />
          ) : (
            <img
              src={server.banner}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
      )}
      <div className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {server.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={server.icon}
              alt={server.name}
              className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">${isOnline ? '🟢' : '⬛'}</div>`;
              }}
            />
          ) : (
            <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
              {isOnline ? (
                <Server className="w-5 h-5 text-green-400" />
>>>>>>> Stashed changes
            ) : (
              <img
                src={server.banner}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>
        )}
        <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {server.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={server.icon}
                alt={server.name}
                className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">${isOnline ? '🟢' : '⬛'}</div>`;
                }}
              />
            ) : (
              <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                {isOnline ? (
                  <Server className="w-5 h-5 text-green-400" />
              ) : (
                  <WifiOff className="w-5 h-5 text-zinc-600" />
                )}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                {server.name}
                {server.verified && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                    Verified
                  </span>
                )}
              </h3>
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
        </div>
      </Link>

      <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-col gap-0.5">
            <div className="text-sm">
              {isOnline ? (
                <span className="text-green-400">
                  {player_count}/{max_players} online
                </span>
              ) : (
                <span className="text-zinc-500">Offline</span>
              )}
            </div>
            <LastChecked time={last_checked} />
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
        <div className="flex items-center justify-center">
          <span className="text-sm font-mono text-zinc-400 bg-zinc-800 px-3 py-1.5 rounded-lg">
            {server.ip}:{server.port}
          </span>
        </div>
      </div>
    </div>
  );
}
