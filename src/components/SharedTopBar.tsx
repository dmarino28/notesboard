"use client";

// SharedTopBar — segmented nav + auth widget used by Actions, Calendar, Timeline, Notes.
// Keeps global navigation consistent across all non-board views.

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Props = {
  boardHref?: string;
};

export function SharedTopBar({ boardHref = "/" }: Props) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // Resolved href for the Board nav item: prefer the most recently visited board
  // (stored in localStorage) so the link works even from a fresh session.
  const [resolvedBoardHref, setResolvedBoardHref] = useState(boardHref);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("nb:lastBoardHref");
    if (stored) setResolvedBoardHref(stored);
  }, []);

  // Nav order: Notes → Board → Actions → Calendar → Timeline
  const views = [
    { label: "Notes",    href: "/notes" },
    { label: "Board",    href: resolvedBoardHref },
    { label: "Actions",  href: "/actions" },
    { label: "Calendar", href: "/calendar" },
    { label: "Timeline", href: "/timeline" },
  ];

  function isActive(label: string, href: string) {
    if (label === "Board") return !!pathname?.startsWith("/board/");
    return pathname === href;
  }

  const authEl = userEmail ? (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 md:flex">
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[8px] font-semibold text-indigo-600">
          {userEmail[0].toUpperCase()}
        </div>
        <span className="max-w-[120px] truncate text-[11px] text-gray-600">
          {userEmail}
        </span>
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
    <Link
      href="/login"
      className="text-[11px] text-gray-500 transition-colors hover:text-gray-700"
    >
      Sign in
    </Link>
  );

  return (
    <header className="relative z-10 flex-shrink-0 border-b border-gray-200 bg-white pt-[env(safe-area-inset-top,0px)] shadow-topbar">

      {/* ── Mobile: two rows — < 640px (sm) ────────────────────────────────────── */}
      <div className="sm:hidden">
        {/* Row 1: auth only, right-aligned */}
        <div className="flex h-11 items-center justify-end px-4">
          {authEl}
        </div>
        {/* Row 2: nav tabs, horizontally scrollable */}
        <div className="overflow-x-auto border-t border-gray-100 px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex min-w-max gap-0.5">
            {views.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive(label, href)
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

      {/* ── Desktop: single row — ≥ 640px (sm) ─────────────────────────────────── */}
      {/*
          SharedTopBar has no board selector, so nav + auth fits comfortably in
          one row from sm upward. grid-cols-[1fr_auto_1fr] keeps the nav
          geometrically centered at any width — left 1fr and right 1fr split
          remaining space equally; neither track can overlap the center track.
      */}
      <div className="hidden h-[56px] grid-cols-[1fr_auto_1fr] items-center px-5 sm:grid">

        {/* Left — empty balancing spacer */}
        <div />

        {/* Center — nav pill at natural width, always centered */}
        <nav className="flex items-center rounded-[10px] bg-gray-100 p-0.5 shadow-inner">
          {views.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors ${
                isActive(label, href)
                  ? "py-[7px] bg-white text-indigo-600 shadow-[0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-gray-200"
                  : "py-1.5 text-gray-600 hover:bg-white/70"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right — auth, right-aligned */}
        <div className="flex items-center justify-end gap-2">
          {authEl}
        </div>
      </div>
    </header>
  );
}
