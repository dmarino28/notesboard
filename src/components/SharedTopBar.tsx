"use client";

// SharedTopBar — segmented nav + auth widget used by Actions, Calendar, Timeline.
// Keeps global navigation consistent across all non-board views.

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Props = {
  boardHref: string;
};

export function SharedTopBar({ boardHref }: Props) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);

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

  const views = [
    { label: "Actions", href: "/actions" },
    { label: "Board", href: boardHref },
    { label: "Calendar", href: "/calendar" },
    { label: "Timeline", href: "/timeline" },
  ];

  function isActive(label: string, href: string) {
    return label === "Board" ? pathname?.startsWith("/board/") : pathname === href;
  }

  const authEl = userEmail ? (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[140px] truncate text-[11px] text-neutral-500 sm:inline">
        {userEmail}
      </span>
      <button
        type="button"
        className="text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
        onClick={() => supabase.auth.signOut()}
      >
        Sign out
      </button>
    </div>
  ) : (
    <Link
      href="/login"
      className="text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
    >
      Sign in
    </Link>
  );

  return (
    <header className="relative z-10 flex-shrink-0 border-b border-white/[0.05] bg-neutral-950/60 pt-[env(safe-area-inset-top,0px)] shadow-sm shadow-black/20 backdrop-blur-md">

      {/* ── Mobile: two rows (hidden on sm+) ─────────────────────────────────── */}
      <div className="sm:hidden">
        {/* Row 1: auth only — right-aligned */}
        <div className="flex h-11 items-center justify-end px-4">
          {authEl}
        </div>
        {/* Row 2: nav tabs — horizontally scrollable */}
        <div className="overflow-x-auto border-t border-white/[0.04] px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex min-w-max gap-0.5">
            {views.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className={`whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                  isActive(label, href)
                    ? "bg-neutral-700/80 text-white shadow-sm"
                    : "text-neutral-500 hover:text-neutral-200"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Desktop: single row (hidden on mobile) ───────────────────────────── */}
      <div className="relative hidden h-[52px] items-center px-4 sm:flex">
        {/* Center: segmented nav */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center rounded-[10px] bg-white/[0.05] p-0.5">
          {views.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                isActive(label, href)
                  ? "bg-neutral-700/80 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {/* Right: auth */}
        <div className="ml-auto flex items-center gap-2">
          {authEl}
        </div>
      </div>
    </header>
  );
}
