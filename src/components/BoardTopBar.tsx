"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BoardSelector } from "./BoardSelector";
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
}: Props) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);

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

  return (
    <header className="relative z-10 flex h-[52px] flex-shrink-0 items-center gap-3 border-b border-white/[0.05] bg-neutral-950/60 px-4 shadow-sm shadow-black/20 backdrop-blur-md">
      {/* Left: board switcher (name is the trigger) */}
      <BoardSelector
        boards={boards}
        currentBoardId={boardId}
        onCreateBoard={onCreateBoard}
        onRenameBoard={onRenameBoard}
        onDeleteBoard={onDeleteBoard}
      />

      {/* Center: Apple-style segmented view control */}
      <nav className="absolute left-1/2 -translate-x-1/2 flex items-center rounded-[10px] bg-white/[0.05] p-0.5">
        {views.map(({ label, href }) => {
          const isActive =
            label === "Board"
              ? pathname?.startsWith("/board/")
              : pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={`rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-neutral-700/80 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right: search + archived toggle + auth */}
      <div className="ml-auto flex items-center gap-3">
        {/* Global search input — shown when onSearchChange is wired */}
        {onSearchChange && (
          <div className="relative flex items-center">
            <svg
              className="pointer-events-none absolute left-2 h-3 w-3 text-neutral-600"
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
              className="w-36 rounded-lg border border-white/[0.07] bg-neutral-900/60 py-1 pl-6 pr-2 text-xs text-neutral-300 placeholder-neutral-600 transition-all duration-150 focus:w-48 focus:border-white/[0.14] focus:bg-neutral-900 focus:text-neutral-100 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-1.5 text-neutral-600 transition-colors hover:text-neutral-400"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300">
          <input
            type="checkbox"
            className="accent-neutral-400"
            checked={showArchived}
            onChange={(e) => onShowArchivedChange(e.target.checked)}
          />
          Archived
        </label>
        {userEmail ? (
          <div className="flex items-center gap-2">
            <span className="max-w-[140px] truncate text-[11px] text-neutral-500">{userEmail}</span>
            <button
              type="button"
              className="text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link href="/login" className="text-[11px] text-neutral-500 transition-colors hover:text-neutral-300">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
