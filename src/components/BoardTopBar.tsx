"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BoardSelector } from "./BoardSelector";
import { AiQueryBar } from "./AiQueryBar";
import type { BoardRow } from "@/lib/boards";
import { supabase } from "@/lib/supabase";

type Props = {
  boards: BoardRow[];
  boardId: string;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  onRenameBoard: (id: string, name: string) => Promise<void>;
  onCreateBoard: (name: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onOpenNote?: (noteId: string) => void;
};

// Nav order: Notes → Board → Actions → Calendar → Timeline
const NAV_ORDER = ["Notes", "Board", "Actions", "Calendar", "Timeline"] as const;

export function BoardTopBar({
  boards,
  boardId,
  showArchived,
  onShowArchivedChange,
  onRenameBoard,
  onCreateBoard,
  onDeleteBoard,
  searchQuery,
  onSearchChange,
  onOpenNote,
}: Props) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showQueryBar, setShowQueryBar] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const views = [
    { label: "Notes",    href: "/notes" },
    { label: "Board",    href: `/board/${boardId}` },
    { label: "Actions",  href: "/actions" },
    { label: "Calendar", href: "/calendar" },
    { label: "Timeline", href: "/timeline" },
  ];

  // Defensive sort in case the array gets reordered accidentally elsewhere
  void NAV_ORDER;

  function isActiveView(label: string, href: string) {
    return label === "Board" ? pathname?.startsWith("/board/") : pathname === href;
  }

  function tabClass(label: string, href: string, _size: "sm" | "lg") {
    const active = isActiveView(label, href);
    return [
      "whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors",
      active
        ? "py-[7px] bg-white text-indigo-600 shadow-[0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-gray-200"
        : "py-1.5 text-gray-600 hover:bg-white/70",
    ].join(" ");
  }

  // Compact auth: sign-out text only (for tight rows)
  const authCompact = userEmail ? (
    <button
      type="button"
      className="whitespace-nowrap text-[11px] text-gray-400 transition-colors hover:text-gray-600"
      onClick={() => supabase.auth.signOut()}
    >
      Sign out
    </button>
  ) : (
    <Link href="/login" className="whitespace-nowrap text-[11px] text-gray-500 hover:text-gray-700">
      Sign in
    </Link>
  );

  // Full auth: avatar chip + sign-out (for wide desktop row)
  const authFull = userEmail ? (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[8px] font-semibold text-indigo-600">
          {userEmail[0].toUpperCase()}
        </div>
        <span className="max-w-[100px] truncate text-[11px] text-gray-600">{userEmail}</span>
      </div>
      <button
        type="button"
        className="whitespace-nowrap text-[11px] text-gray-400 transition-colors hover:text-gray-600"
        onClick={() => supabase.auth.signOut()}
      >
        Sign out
      </button>
    </div>
  ) : (
    <Link href="/login" className="whitespace-nowrap text-[11px] text-gray-500 hover:text-gray-700">
      Sign in
    </Link>
  );

  const searchInput = (compact: boolean) =>
    onSearchChange ? (
      <div className="relative flex items-center">
        <svg
          className="pointer-events-none absolute left-1.5 h-3 w-3 text-gray-400"
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="6.5" cy="6.5" r="4" />
          <path d="M10 10l3 3" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search"
          value={searchQuery ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          className={[
            "rounded-lg border border-gray-200 bg-gray-50 py-1 pl-5 pr-2 text-xs text-gray-700",
            "placeholder-gray-400 outline-none transition-all duration-150",
            "focus:border-indigo-300 focus:bg-white focus:text-gray-900",
            compact ? "w-20 focus:w-28" : "w-28 focus:w-44",
          ].join(" ")}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-1 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    ) : null;

  return (
    <header className="relative z-10 flex-shrink-0 border-b border-gray-200 bg-white pt-[env(safe-area-inset-top,0px)] shadow-topbar">

      {/* ── TIER 1: Mobile — < 640px (sm) ────────────────────────────────────── */}
      {/* Row 1: board selector + compact search + auth                           */}
      {/* Row 2: nav tabs, horizontally scrollable                                */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <BoardSelector
            boards={boards}
            currentBoardId={boardId}
            onCreateBoard={onCreateBoard}
            onRenameBoard={onRenameBoard}
            onDeleteBoard={onDeleteBoard}
          />
          <div className="flex-1" />
          {searchInput(true)}
          {authCompact}
        </div>
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex min-w-max gap-0.5 px-3 pb-2">
            {views.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  isActiveView(label, href)
                    ? "bg-white text-indigo-600 shadow-[0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-gray-200"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* ── TIER 2: Intermediate — 640–1023px (sm to lg) ─────────────────────── */}
      {/* Nav gets priority: it lives alone in Row 1, full-width, always visible. */}
      {/* Row 2 holds board selector on the left and utility controls on the      */}
      {/* right. Because these two rows never share horizontal space with the nav, */}
      {/* overlap is structurally impossible.                                      */}
      <div className="hidden sm:block lg:hidden">
        {/* Row 1 — nav pill, centered */}
        <div className="flex h-11 items-center justify-center px-4">
          <nav className="flex items-center rounded-[10px] bg-gray-100 p-0.5 shadow-inner">
            {views.map(({ label, href }) => (
              <Link key={label} href={href} className={tabClass(label, href, "sm")}>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Row 2 — board selector left, utility controls right */}
        <div className="flex h-10 items-center gap-2 border-t border-gray-100 px-4">
          <BoardSelector
            boards={boards}
            currentBoardId={boardId}
            onCreateBoard={onCreateBoard}
            onRenameBoard={onRenameBoard}
            onDeleteBoard={onDeleteBoard}
          />
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setShowQueryBar((v) => !v)}
            className={`whitespace-nowrap text-[11px] transition-colors ${
              showQueryBar ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ✦ Ask
          </button>
          {searchInput(true)}
          <label className="flex cursor-pointer select-none items-center gap-1 whitespace-nowrap text-xs text-gray-500 hover:text-gray-700">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={showArchived}
              onChange={(e) => onShowArchivedChange(e.target.checked)}
            />
            Archived
          </label>
          {authCompact}
        </div>
      </div>

      {/* ── TIER 3: Desktop — ≥ 1024px (lg) ─────────────────────────────────── */}
      {/* Three-column grid: board selector | nav | utility controls              */}
      {/* grid-cols-[auto_1fr_auto] means no track can overlap another.           */}
      <div className="hidden h-[56px] grid-cols-[auto_1fr_auto] items-center gap-3 px-5 lg:grid">

        {/* Left — board selector, anchored */}
        <div className="flex flex-shrink-0 items-center">
          <BoardSelector
            boards={boards}
            currentBoardId={boardId}
            onCreateBoard={onCreateBoard}
            onRenameBoard={onRenameBoard}
            onDeleteBoard={onDeleteBoard}
          />
        </div>

        {/* Center — nav, centered within the 1fr middle track */}
        <div className="flex min-w-0 justify-center">
          <nav className="flex items-center rounded-[10px] bg-gray-100 p-0.5 shadow-inner">
            {views.map(({ label, href }) => (
              <Link key={label} href={href} className={tabClass(label, href, "lg")}>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right — utility controls, anchored */}
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowQueryBar((v) => !v)}
            className={`whitespace-nowrap text-[11px] transition-colors ${
              showQueryBar ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ✦ Ask
          </button>
          {searchInput(false)}
          <label className="flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap text-xs text-gray-500 transition-colors hover:text-gray-700">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={showArchived}
              onChange={(e) => onShowArchivedChange(e.target.checked)}
            />
            Archived
          </label>
          {authFull}
        </div>
      </div>

      {/* AI Query Bar — slides in below the header row(s) */}
      {showQueryBar && (
        <AiQueryBar
          boardId={boardId}
          onClose={() => setShowQueryBar(false)}
          onOpenNote={onOpenNote}
        />
      )}
    </header>
  );
}
