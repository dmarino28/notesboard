"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoardSelector } from "./BoardSelector";
import type { BoardRow } from "@/lib/boards";

type Props = {
  boards: BoardRow[];
  boardId: string;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  onRenameBoard: (id: string, name: string) => Promise<void>;
  onCreateBoard: (name: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
};

export function BoardTopBar({
  boards,
  boardId,
  showArchived,
  onShowArchivedChange,
  onRenameBoard,
  onCreateBoard,
  onDeleteBoard,
}: Props) {
  const pathname = usePathname();

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

      {/* Right: archived toggle */}
      <div className="ml-auto flex items-center">
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300">
          <input
            type="checkbox"
            className="accent-neutral-400"
            checked={showArchived}
            onChange={(e) => onShowArchivedChange(e.target.checked)}
          />
          Archived
        </label>
      </div>
    </header>
  );
}
