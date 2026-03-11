"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BoardRow } from "@/lib/boards";

type Props = {
  boards: BoardRow[];
  currentBoardId: string;
  onCreateBoard: (name: string) => Promise<void>;
  onRenameBoard: (id: string, name: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
};

export function BoardSelector({
  boards,
  currentBoardId,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredBoards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => b.name.toLowerCase().includes(q));
  }, [boards, searchQuery]);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePopover();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // Auto-focus search when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  function openPopover() {
    setOpen(true);
    setSearchQuery("");
    setEditingId(null);
    setDeletingId(null);
  }

  function closePopover() {
    setOpen(false);
    setSearchQuery("");
    setEditingId(null);
    setDeletingId(null);
    setNewName("");
  }

  function handleSwitch(id: string) {
    closePopover();
    router.push(`/board/${id}`);
  }

  function startEdit(board: BoardRow) {
    setEditingId(board.id);
    setEditName(board.name);
    setDeletingId(null);
  }

  async function handleRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSaving(true);
    await onRenameBoard(id, trimmed);
    setEditingId(null);
    setSaving(false);
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    await onCreateBoard(trimmed);
    setNewName("");
    setSaving(false);
    closePopover();
  }

  async function handleDelete(id: string) {
    setSaving(true);
    await onDeleteBoard(id);
    setDeletingId(null);
    setSaving(false);
    closePopover();
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Board name trigger */}
      <button
        onClick={() => (open ? closePopover() : openPopover())}
        aria-label="Switch board"
        className={`flex max-w-[12rem] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold tracking-tight shadow-sm transition-all duration-150 ${
          open
            ? "border-gray-300 bg-gray-50 text-gray-900"
            : "border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <span className="truncate">{boards.find((b) => b.id === currentBoardId)?.name ?? "Boards"}</span>
        <ChevronDownIcon open={open} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-white/[0.09] bg-neutral-900 shadow-2xl shadow-black/60">
          {/* Search */}
          <div className="border-b border-white/[0.07] p-2">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search boards…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/[0.07] bg-neutral-800/70 px-3 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20"
              onKeyDown={(e) => {
                if (e.key === "Escape") closePopover();
              }}
            />
          </div>

          {/* Board list */}
          <ul className="max-h-60 overflow-y-auto py-1">
            {filteredBoards.length === 0 && (
              <li className="px-3 py-3 text-center text-xs text-neutral-600">No boards found</li>
            )}
            {filteredBoards.map((board) => {
              const isCurrent = board.id === currentBoardId;
              const isEditing = editingId === board.id;
              const isDeleting = deletingId === board.id;

              return (
                <li key={board.id}>
                  {isEditing ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <input
                        className="flex-1 rounded-md border border-white/[0.10] bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-indigo-500/40"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(board.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                        onClick={() => void handleRename(board.id)}
                        disabled={saving || !editName.trim()}
                      >
                        Save
                      </button>
                      <button
                        className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300"
                        onClick={() => setEditingId(null)}
                      >
                        ✕
                      </button>
                    </div>
                  ) : isDeleting ? (
                    <div className="mx-2 my-1 space-y-1.5 rounded-lg bg-neutral-800/80 p-2.5">
                      <p className="text-xs text-neutral-300">
                        Delete &quot;{board.name}&quot;? All columns and cards will be lost.
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="rounded-md bg-red-600 px-2.5 py-1 text-xs text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                          onClick={() => void handleDelete(board.id)}
                          disabled={saving}
                        >
                          {saving ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          className="text-xs text-neutral-400 hover:text-neutral-200"
                          onClick={() => setDeletingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-lg ${
                        isCurrent
                          ? "bg-white/[0.06] text-neutral-100"
                          : "text-neutral-300 hover:bg-white/[0.04] hover:text-neutral-100"
                      }`}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                        onClick={() => !isCurrent && handleSwitch(board.id)}
                      >
                        {isCurrent && (
                          <span className="shrink-0 text-indigo-400">
                            <CheckIcon />
                          </span>
                        )}
                        <span className="truncate">{board.name}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="rounded p-0.5 text-neutral-500 transition-colors hover:text-neutral-300"
                          onClick={() => startEdit(board)}
                          title="Rename"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          className="rounded p-0.5 text-neutral-600 transition-colors hover:text-red-400"
                          onClick={() => {
                            setDeletingId(board.id);
                            setEditingId(null);
                          }}
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Create new board */}
          <div className="border-t border-white/[0.07] p-2">
            <div className="flex gap-1.5">
              <input
                className="flex-1 rounded-lg border border-white/[0.07] bg-neutral-800/70 px-3 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20"
                placeholder="New board name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
                disabled={saving}
              />
              <button
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                onClick={() => void handleCreate()}
                disabled={saving || !newName.trim()}
              >
                {saving ? "…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-neutral-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="2,6 5,9 10,3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1,3 10,3" />
      <path d="M4 3V1.5h3V3" />
      <path d="M2 3l.5 7h6L9 3" />
    </svg>
  );
}
