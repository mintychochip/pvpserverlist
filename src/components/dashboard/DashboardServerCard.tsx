"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Server, Vote, Pencil, Trash2, CheckCircle } from "lucide-react";
import { EditServerModal } from "./EditServerModal";

interface DashboardServerCardProps {
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
  };
}

export function DashboardServerCard({ server }: DashboardServerCardProps) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {server.icon ? (
              <img
                src={server.icon}
                alt={server.name}
                className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                <Server className="w-5 h-5 text-zinc-400" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                {server.name}
                {server.verified && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                {server.ip}:{server.port}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEdit(true)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              title="Edit server"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Delete server"
            >
              <Trash2 className="w-4 h-4" />
            </button>
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
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Vote className="w-3 h-3" />
            {server.vote_count} votes
          </div>
        </div>
      </div>

      {showEdit && (
        <EditServerModal
          server={server}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Server?</h2>
            <p className="text-sm text-zinc-400 mb-4">
              Are you sure you want to delete <strong>{server.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white font-medium py-2 rounded-lg transition-colors"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
