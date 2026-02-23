"use client";

import { useState } from "react";
import type { TagDef } from "@/lib/userActions";
import { updateTagDef, deleteTagDef } from "@/lib/userActions";

type Props = {
  tagDefs: TagDef[];
  onTagDefsChange: (defs: TagDef[]) => void;
  onClose: () => void;
};

export function ManageGroupsModal({ tagDefs, onTagDefsChange, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = [...tagDefs].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  async function handleRename(def: TagDef) {
    const newName = editName.trim();
    if (!newName || newName === def.name) {
      setEditingId(null);
      return;
    }
    const updated = await updateTagDef(def.id, { name: newName });
    if (updated) {
      onTagDefsChange(tagDefs.map((d) => (d.id === def.id ? updated : d)));
    }
    setEditingId(null);
  }

  async function handleDelete(def: TagDef) {
    const ok = await deleteTagDef(def.id);
    if (ok) {
      onTagDefsChange(tagDefs.filter((d) => d.id !== def.id));
    }
    setDeletingId(null);
  }

  async function handleReorder(def: TagDef, direction: "up" | "down") {
    const idx = sorted.indexOf(def);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swap = sorted[swapIdx];
    const [a, b] = await Promise.all([
      updateTagDef(def.id, { sort_order: swap.sort_order }),
      updateTagDef(swap.id, { sort_order: def.sort_order }),
    ]);
    if (a && b) {
      onTagDefsChange(
        tagDefs.map((d) => {
          if (d.id === def.id) return a;
          if (d.id === swap.id) return b;
          return d;
        }),
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/[0.07] bg-neutral-900 p-5 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">Manage Groups</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 transition-colors hover:text-neutral-300"
          >
            ✕
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No groups yet. Add one from the Flagged section.
          </p>
        ) : (
          <ul className="space-y-1">
            {sorted.map((def, idx) => (
              <li
                key={def.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
              >
                {editingId === def.id ? (
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  <input
                    autoFocus
                    className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-sm text-neutral-200 outline-none focus:border-indigo-500/50"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename(def);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => void handleRename(def)}
                  />
                ) : (
                  <span
                    className="flex-1 cursor-pointer text-sm text-neutral-300 hover:text-neutral-100"
                    onClick={() => {
                      setEditingId(def.id);
                      setEditName(def.name);
                    }}
                  >
                    {def.name}
                  </span>
                )}

                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => void handleReorder(def, "up")}
                  className="text-neutral-600 transition-colors hover:text-neutral-400 disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={idx === sorted.length - 1}
                  onClick={() => void handleReorder(def, "down")}
                  className="text-neutral-600 transition-colors hover:text-neutral-400 disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>

                {deletingId === def.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleDelete(def)}
                      className="text-xs text-red-400 transition-colors hover:text-red-300"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(null)}
                      className="text-xs text-neutral-600 transition-colors hover:text-neutral-400"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeletingId(def.id)}
                    className="text-neutral-700 transition-colors hover:text-red-400"
                    title="Delete group"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
