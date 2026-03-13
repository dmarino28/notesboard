"use client";

import type { ViewMode } from "@/lib/noteViews";

type Props = {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  selectedCount: number;
  onOrganize: () => void;
  organizing: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: "all", label: "All" },
  { mode: "film", label: "Film" },
  { mode: "daily", label: "Daily" },
  { mode: "market", label: "Market" },
  { mode: "signals", label: "Signals" },
];

export function NotesToolbar({
  view,
  onViewChange,
  selectedCount,
  onOrganize,
  organizing,
  searchQuery,
  onSearchChange,
}: Props) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-2">
      {/* Left: view tabs */}
      <nav className="flex items-center gap-0.5 rounded-[9px] bg-black/[0.04] p-0.5">
        {VIEWS.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewChange(mode)}
            className={`rounded-[7px] px-3 py-1 text-xs font-medium transition-all duration-100 ${
              view === mode
                ? "bg-white text-indigo-600 shadow-sm ring-1 ring-inset ring-black/[0.04]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Right: search + organize */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex items-center">
          <svg
            className="pointer-events-none absolute left-2 h-3 w-3 text-gray-400"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="6.5" cy="6.5" r="4" />
            <path d="M10 10l3 3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-36 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-6 pr-2 text-xs text-gray-700 outline-none placeholder:text-gray-400 transition-all focus:w-48 focus:border-indigo-300 focus:bg-white focus:text-gray-900"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Organize button */}
        <button
          type="button"
          onClick={onOrganize}
          disabled={organizing}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          <span>✦</span>
          {organizing ? "Analyzing…" : selectedCount > 0 ? `Organize ${selectedCount} selected` : "Organize Notes"}
        </button>
      </div>
    </div>
  );
}
