"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoardSelector } from "./BoardSelector";
import type { BoardRow } from "@/lib/boards";

type Props = {
  currentBoard: BoardRow | undefined;
  boards: BoardRow[];
  boardId: string;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  onRenameBoard: (id: string, name: string) => Promise<void>;
  onCreateBoard: (name: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
  showManager: boolean;
  onToggleManager: () => void;
};

export function BoardTopBar({
  currentBoard,
  boards,
  boardId,
  showArchived,
  onShowArchivedChange,
  onRenameBoard,
  onCreateBoard,
  onDeleteBoard,
  showManager,
  onToggleManager,
}: Props) {
  const pathname = usePathname();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setNameValue(currentBoard?.name ?? "");
    setEditingName(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== currentBoard?.name && currentBoard) {
      await onRenameBoard(currentBoard.id, trimmed);
    }
    setEditingName(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitEdit();
    }
    if (e.key === "Escape") {
      setEditingName(false);
    }
  }

  const views = [
    { label: "Board", href: `/board/${boardId}` },
    { label: "Calendar", href: "/calendar" },
    { label: "Timeline", href: "/timeline" },
  ];

  return (
    <header className="relative z-10 flex h-12 flex-shrink-0 items-center gap-3 border-b border-white/8 bg-neutral-900/90 px-4 backdrop-blur-sm">
      {/* Left: board selector + inline-editable name */}
      <div className="flex min-w-0 items-center gap-2">
        <BoardSelector
          boards={boards}
          currentBoardId={boardId}
          onCreateBoard={onCreateBoard}
          onRenameBoard={onRenameBoard}
          onDeleteBoard={onDeleteBoard}
        />
        {editingName ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={handleKeyDown}
            className="w-44 min-w-0 rounded bg-white/10 px-2 py-0.5 text-sm font-semibold text-white outline-none ring-1 ring-white/30 focus:ring-white/60"
          />
        ) : (
          <button
            onClick={startEdit}
            title="Click to rename"
            className="max-w-[10rem] truncate rounded px-2 py-0.5 text-sm font-semibold text-neutral-100 hover:bg-white/10 transition-colors"
          >
            {currentBoard?.name ?? "Untitled board"}
          </button>
        )}
      </div>

      {/* Center: view switcher */}
      <nav className="flex items-center gap-0.5 rounded-lg bg-white/5 p-1">
        {views.map(({ label, href }) => {
          const isActive =
            label === "Board"
              ? pathname?.startsWith("/board/")
              : pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-neutral-400 hover:bg-white/8 hover:text-neutral-200"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right: controls */}
      <div className="ml-auto flex items-center gap-3">
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors">
          <input
            type="checkbox"
            className="accent-neutral-400"
            checked={showArchived}
            onChange={(e) => onShowArchivedChange(e.target.checked)}
          />
          Archived
        </label>
        <button
          onClick={onToggleManager}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            showManager
              ? "bg-white/15 text-white"
              : "text-neutral-400 hover:bg-white/8 hover:text-neutral-200"
          }`}
        >
          {showManager ? "Close" : "Manage lists"}
        </button>
      </div>
    </header>
  );
}
