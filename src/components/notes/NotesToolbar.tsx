"use client";

import { useEffect, useRef, useState } from "react";
import type { ViewMode } from "@/lib/noteViews";

const SIGNAL_HELP_KEY = "nb:signalHelpSeen";

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
  const [showHelp, setShowHelp] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  // Auto-show on first visit — dismissed state persisted in localStorage.
  useEffect(() => {
    if (!localStorage.getItem(SIGNAL_HELP_KEY)) {
      setShowHelp(true);
    }
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!showHelp) return;
    function handleClick(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
        localStorage.setItem(SIGNAL_HELP_KEY, "1");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showHelp]);

  function toggleHelp() {
    setShowHelp((prev) => {
      const next = !prev;
      if (!next) localStorage.setItem(SIGNAL_HELP_KEY, "1");
      return next;
    });
  }

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

      {/* Right: signal help + search + organize */}
      <div className="flex items-center gap-2">
        {/* Signal color help */}
        <div ref={helpRef} className="relative">
          <button
            type="button"
            onClick={toggleHelp}
            title="What do the colors mean?"
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
              showHelp
                ? "bg-indigo-100 text-indigo-600"
                : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            }`}
          >
            ?
          </button>

          {showHelp && (
            <div className="absolute right-0 top-8 z-50 w-52 rounded-xl border border-gray-200 bg-white p-3.5 shadow-xl">
              <p className="mb-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Signal colors
              </p>
              <div className="space-y-1.5">
                <SignalLegendRow color="#6366f1" label="Board" example="F1" />
                <SignalLegendRow color="#047857" label="Date" example="next Friday" />
                <SignalLegendRow color="#6d28d9" label="Channel" example="#slack" />
                <SignalLegendRow color="#b45309" label="Milestone" example="v2 launch" />
                <SignalLegendRow color="#0f766e" label="Market" example="AAPL" />
              </div>
              <p className="mt-3 text-[10px] text-gray-400">
                Signals are detected as you type. Use Organize to route notes to boards.
              </p>
            </div>
          )}
        </div>

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

function SignalLegendRow({ color, label, example }: { color: string; label: string; example: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs text-gray-700">{label}</span>
      </div>
      <span className="text-[11px]" style={{ color }}>{example}</span>
    </div>
  );
}
