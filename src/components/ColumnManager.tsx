"use client";

import { useState } from "react";
import { ColumnRow } from "@/lib/columns";

type Props = {
  columns: ColumnRow[];
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onUpdateColor: (id: string, color: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function ColumnManager({
  columns,
  onAdd,
  onRename,
  onUpdateColor,
  onReorder,
  onDelete,
}: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Tracks in-progress color edits per column (cleared on blur after persisting).
  const [colorOverrides, setColorOverrides] = useState<Map<string, string>>(new Map());

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    await onAdd(trimmed);
    setNewName("");
    setSaving(false);
  }

  async function handleRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSaving(true);
    await onRename(id, trimmed);
    setEditingId(null);
    setSaving(false);
  }

  function startEdit(col: ColumnRow) {
    setEditingId(col.id);
    setEditName(col.name);
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const reordered = [...columns];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    onReorder(reordered.map((c) => c.id));
  }

  function moveDown(index: number) {
    if (index === columns.length - 1) return;
    const reordered = [...columns];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    onReorder(reordered.map((c) => c.id));
  }

  async function confirmDelete() {
    if (!deletingId) return;
    setSaving(true);
    await onDelete(deletingId);
    setDeletingId(null);
    setSaving(false);
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <h2 className="text-sm font-semibold text-neutral-200">Manage Columns</h2>

      {columns.length === 0 && <p className="text-xs text-neutral-500">No columns yet.</p>}

      <ul className="space-y-2">
        {columns.map((col, index) => {
          const isEditing = editingId === col.id;
          const isDeleting = deletingId === col.id;

          return (
            <li key={col.id} className="space-y-2 rounded border border-neutral-800 p-2">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-neutral-600"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(col.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    className="text-xs text-white disabled:opacity-50"
                    onClick={() => handleRename(col.id)}
                    disabled={saving || !editName.trim()}
                  >
                    Save
                  </button>
                  <button
                    className="text-xs text-neutral-400"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {/* Color picker */}
                  <input
                    type="color"
                    value={colorOverrides.get(col.id) ?? col.color ?? "#6b7280"}
                    onChange={(e) => {
                      const color = e.target.value;
                      setColorOverrides((prev) => new Map(prev).set(col.id, color));
                    }}
                    onBlur={(e) => {
                      const color = e.target.value;
                      setColorOverrides((prev) => {
                        const next = new Map(prev);
                        next.delete(col.id);
                        return next;
                      });
                      if (color !== (col.color ?? "#6b7280")) {
                        onUpdateColor(col.id, color);
                      }
                    }}
                    className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    title="Column color"
                  />
                  <span className="flex-1 text-sm text-neutral-200">{col.name}</span>
                  <button
                    className="text-xs text-neutral-400 hover:text-white"
                    onClick={() => startEdit(col)}
                  >
                    Rename
                  </button>
                  <button
                    className="text-xs text-neutral-400 hover:text-white disabled:opacity-30"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="text-xs text-neutral-400 hover:text-white disabled:opacity-30"
                    onClick={() => moveDown(index)}
                    disabled={index === columns.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className="text-xs text-red-500 hover:text-red-400"
                    onClick={() => setDeletingId(col.id)}
                  >
                    Delete
                  </button>
                </div>
              )}

              {isDeleting && (
                <div className="space-y-2 rounded bg-neutral-900 p-2">
                  <p className="text-xs text-neutral-300">
                    Delete &quot;{col.name}&quot;? All notes in this column will be lost.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                      onClick={confirmDelete}
                      disabled={saving}
                    >
                      {saving ? "Deleting…" : "Confirm Delete"}
                    </button>
                    <button
                      className="text-xs text-neutral-400"
                      onClick={() => setDeletingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <p className="text-xs font-medium text-neutral-400">Add Column</p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-neutral-700"
            placeholder="Column name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            disabled={saving}
          />
          <button
            className="rounded bg-white px-3 py-1 text-xs font-medium text-black disabled:opacity-50"
            onClick={handleAdd}
            disabled={saving || !newName.trim()}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
