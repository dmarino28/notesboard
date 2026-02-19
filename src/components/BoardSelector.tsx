"use client";

import { useState, useRef, useEffect } from "react";
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
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentBoard = boards.find((b) => b.id === currentBoardId);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
        setDeletingId(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleSwitch(id: string) {
    setOpen(false);
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
    setOpen(false);
  }

  async function handleDelete(id: string) {
    setSaving(true);
    await onDeleteBoard(id);
    setDeletingId(null);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
        onClick={() => {
          setOpen((v) => !v);
          setEditingId(null);
          setDeletingId(null);
        }}
      >
        <span>{currentBoard?.name ?? "NotesBoard"}</span>
        <span className="text-neutral-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-neutral-800 bg-neutral-950 p-2 shadow-xl">
          <ul className="space-y-0.5">
            {boards.map((board) => {
              const isCurrent = board.id === currentBoardId;
              const isEditing = editingId === board.id;
              const isDeleting = deletingId === board.id;

              return (
                <li key={board.id}>
                  {isEditing ? (
                    <div className="flex items-center gap-1 p-1">
                      <input
                        className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-sm outline-none focus:border-neutral-600"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(board.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        className="text-xs text-white disabled:opacity-50"
                        onClick={() => handleRename(board.id)}
                        disabled={saving || !editName.trim()}
                      >
                        Save
                      </button>
                      <button
                        className="text-xs text-neutral-400"
                        onClick={() => setEditingId(null)}
                      >
                        ✕
                      </button>
                    </div>
                  ) : isDeleting ? (
                    <div className="space-y-1 rounded bg-neutral-900 p-2">
                      <p className="text-xs text-neutral-300">
                        Delete &quot;{board.name}&quot;? All columns and notes will be lost.
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                          onClick={() => handleDelete(board.id)}
                          disabled={saving}
                        >
                          {saving ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          className="text-xs text-neutral-400"
                          onClick={() => setDeletingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`group flex items-center gap-1 rounded px-2 py-1.5 ${
                        isCurrent ? "bg-neutral-800" : "hover:bg-neutral-900"
                      }`}
                    >
                      <button
                        className="flex-1 text-left text-sm text-neutral-200"
                        onClick={() => !isCurrent && handleSwitch(board.id)}
                      >
                        {board.name}
                        {isCurrent && (
                          <span className="ml-1.5 text-xs text-neutral-500">✓</span>
                        )}
                      </button>
                      <button
                        className="hidden text-xs text-neutral-500 hover:text-neutral-300 group-hover:inline"
                        onClick={() => startEdit(board)}
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button
                        className="hidden text-xs text-red-600 hover:text-red-400 group-hover:inline"
                        onClick={() => {
                          setDeletingId(board.id);
                          setEditingId(null);
                        }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-2 border-t border-neutral-800 pt-2">
            <div className="flex gap-1">
              <input
                className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-neutral-700"
                placeholder="New board name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                disabled={saving}
              />
              <button
                className="rounded bg-white px-2 py-1 text-xs font-medium text-black disabled:opacity-50"
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
              >
                {saving ? "…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
