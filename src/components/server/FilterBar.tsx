// src/components/server/FilterBar.tsx

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search, LayoutGrid, List, Eye, EyeOff } from "lucide-react";

const TAGS = ["crystal-pvp", "uhc-pvp", "sumo", "nodepuff", "lifesteal", "smp", "practice", "bridge"];
const VERSIONS = ["1.8", "1.12", "1.16", "1.20.4"];
const SORTS = [
  { value: "votes", label: "Most Votes" },
  { value: "players", label: "Most Players" },
  { value: "latency", label: "Lowest Ping" },
  { value: "newest", label: "Newest" },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/?${params.toString()}`);
  }, [router, searchParams]);

  const currentTag = searchParams.get("tag") ?? "";
  const currentVersion = searchParams.get("version") ?? "";
  const currentSort = searchParams.get("sort") ?? "votes";
  const currentSearch = searchParams.get("search") ?? "";
  const currentLayout = searchParams.get("layout") ?? "grid";

  // Active when: no show_offline param is set (regardless of max_offline_hours value)
  // ON = hide offline servers (default behavior)
  // OFF = show recently offline tab
  const isRecentlyOfflineTab = searchParams.get("show_offline") === "true";
  const isHideOfflineActive = !isRecentlyOfflineTab;

  const toggleHideOffline = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (isHideOfflineActive) {
      // Switch to recently offline tab
      params.set("show_offline", "true");
      params.set("max_offline_hours", "72");
    } else {
      // Switch back to hide offline (default)
      params.delete("show_offline");
      params.delete("max_offline_hours");
    }
    router.push(`/?${params.toString()}`);
  };

  const showRecentlyOffline = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("show_offline", "true");
    params.set("max_offline_hours", "72");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      {/* Search + Layout Toggle Row */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search servers..."
            defaultValue={currentSearch}
            onChange={(e) => updateParam("search", e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        {/* Layout Toggle */}
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          <button
            onClick={() => updateParam("layout", "grid")}
            className={`p-2 rounded transition-colors ${
              currentLayout === "grid"
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => updateParam("layout", "list")}
            className={`p-2 rounded transition-colors ${
              currentLayout === "list"
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Hide Offline Toggle */}
        <button
          onClick={toggleHideOffline}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${
            isHideOfflineActive
              ? "bg-indigo-600 border-indigo-600 text-white"
              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
          }`}
          title={isHideOfflineActive ? "Showing online servers" : "Hiding servers offline for 24+ hours"}
        >
          {isHideOfflineActive ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          Hide offline
        </button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => updateParam("tag", "")}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            !currentTag
              ? "bg-indigo-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          All
        </button>
        <button
          onClick={showRecentlyOffline}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            isRecentlyOfflineTab
              ? "bg-indigo-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          Recently Offline
        </button>
        {TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => updateParam("tag", tag)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              currentTag === tag
                ? "bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Version + Sort row */}
      <div className="flex gap-3">
        <select
          value={currentVersion}
          onChange={(e) => updateParam("version", e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
        >
          <option value="">All Versions</option>
          {VERSIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <select
          value={currentSort}
          onChange={(e) => updateParam("sort", e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
