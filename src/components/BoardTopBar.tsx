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
    { label: "Actions", href: "/actions" },
    { label: "Board", href: `/board/${boardId}` },
    { label: "Calendar", href: "/calendar" },
    { label: "Timeline", href: "/timeline" },
  ];

  function isActiveView(label: string, href: string) {
    return label === "Board" ? pathname?.startsWith("/board/") : pathname === href;
  }

  const authEl = userEmail ? (
    <div className="flex items-center gap-2">
      {/* User chip */}
      <div className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 sm:flex">
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[8px] font-semibold text-indigo-600">
          {userEmail[0].toUpperCase()}
        </div>
        <span className="max-w-[120px] truncate text-[11px] text-gray-600">
          {userEmail}
        </span>
      </div>
      <button
        type="button"
        className="text-[11px] text-gray-400 transition-colors hover:text-gray-600"
        onClick={() => supabase.auth.signOut()}
      >
        Sign out
      </button>
    </div>
  ) : (
    <Link
      href="/login"
      className="text-[11px] text-gray-500 transition-colors hover:text-gray-700"
    >
      Sign in
    </Link>
  );

  return (
    <header className="relative z-10 flex-shrink-0 border-b border-gray-200 bg-white pt-[env(safe-area-inset-top,0px)] shadow-topbar">

      {/* ── Mobile layout: two rows (hidden on sm+) ──────────────────────────── */}
      <div className="sm:hidden">
        {/* Row 1: board selector + compact search + auth */}
        <div className="flex items-center gap-2 px-3 py-2">
          <BoardSelector
            boards={boards}
            currentBoardId={boardId}
            onCreateBoard={onCreateBoard}
            onRenameBoard={onRenameBoard}
            onDeleteBoard={onDeleteBoard}
          />
          <div className="flex-1" />
          {onSearchChange && (
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
                className="w-20 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-5 pr-2 text-xs text-gray-700 placeholder-gray-400 outline-none transition-all duration-150 focus:w-28 focus:border-indigo-300 focus:bg-white focus:text-gray-900"
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
          )}
          {authEl}
        </div>

        {/* Row 2: nav tabs (horizontally scrollable) */}
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex min-w-max gap-0.5 px-3 pb-2">
            {views.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className={`whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                  isActiveView(label, href)
                    ? "bg-white text-indigo-700 shadow-[0_1px_5px_rgba(0,0,0,0.13)]"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Desktop layout: single row (hidden on mobile) ────────────────────── */}
      <div className="relative hidden h-[56px] items-center gap-3 px-4 sm:flex">
        <BoardSelector
          boards={boards}
          currentBoardId={boardId}
          onCreateBoard={onCreateBoard}
          onRenameBoard={onRenameBoard}
          onDeleteBoard={onDeleteBoard}
        />

        {/* Center: segmented view control */}
        <nav className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-[10px] bg-black/[0.07] p-0.5 ring-1 ring-inset ring-black/[0.04]">
          {views.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                isActiveView(label, href)
                  ? "bg-white text-indigo-600 shadow-[0_1px_0_rgba(0,0,0,0.06),0_2px_10px_rgba(0,0,0,0.14)] ring-1 ring-inset ring-black/[0.05]"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right: search + archived toggle + ask AI + auth */}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowQueryBar((v) => !v)}
            className={`text-[11px] transition-colors ${showQueryBar ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            ✦ Ask
          </button>
          {onSearchChange && (
            <div className="relative flex items-center">
              <svg
                className="pointer-events-none absolute left-2 h-3 w-3 text-gray-400"
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
                className="w-36 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-6 pr-2 text-xs text-gray-700 placeholder-gray-400 transition-all duration-150 focus:w-48 focus:border-indigo-300 focus:bg-white focus:text-gray-900 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-1.5 text-gray-400 transition-colors hover:text-gray-600"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-700">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={showArchived}
              onChange={(e) => onShowArchivedChange(e.target.checked)}
            />
            Archived
          </label>
          {authEl}
        </div>
      </div>

      {/* AI Query Bar — expands below the top bar */}
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
