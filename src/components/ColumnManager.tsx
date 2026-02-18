"use client";

import { useState } from "react";
import { ColumnRow } from "@/lib/columns";
import { NoteRow } from "@/lib/notes";

type Props = {
  columns: ColumnRow[];
  notes: NoteRow[];
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onDelete: (id: string, destColumnId?: string) => Promise<void>;
};

export function ColumnManager({ columns, notes, onAdd, onRename, onReorder, onDelete }: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [destColumnId, setDestColumnId] = useState<string>("");
  const [saving, setSaving] = useState(false);

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

  function startDelete(id: string) {
    const others = columns.filter((c) => c.id !== id);
    setDestColumnId(others[0]?.id ?? "");
    setDeletingId(id);
  }

  async function confirmDelete() {
    if (!deletingId) return;
    const hasNotes = notes.some((n) => n.column_id === deletingId);
    setSaving(true);
    await onDelete(deletingId, hasNotes ? destColumnId : undefined);
    setDeletingId(null);
    setDestColumnId("");
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-4">
      <h2 className="text-sm font-semibold text-neutral-200">Manage Columns</h2>

      {columns.length === 0 && (
        <p className="text-xs text-neutral-500">No columns yet.</p>
      )}

      <ul className="space-y-2">
        {columns.map((col, index) => {
          const colNoteCount = notes.filter((n) => n.column_id === col.id).length;
          const isEditing = editingId === col.id;
          const isDeleting = deletingId === col.id;
          const otherColumns = columns.filter((c) => c.id !== col.id);

          return (
            <li key={col.id} className="rounded border border-neutral-800 p-2 space-y-2">
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
                  <span className="flex-1 text-sm text-neutral-200">{col.name}</span>
                  <span className="text-xs text-neutral-500">{colNoteCount}</span>
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
                    onClick={() => startDelete(col.id)}
                  >
                    Delete
                  </button>
                </div>
              )}

              {isDeleting && (
                <div className="space-y-2 rounded bg-neutral-900 p-2">
                  {colNoteCount > 0 ? (
                    <>
                      <p className="text-xs text-neutral-300">
                        Move {colNoteCount} note{colNoteCount !== 1 ? "s" : ""} to:
                      </p>
                      <select
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-200"
                        value={destColumnId}
                        onChange={(e) => setDestColumnId(e.target.value)}
                      >
                        {otherColumns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <p className="text-xs text-neutral-300">
                      Delete &quot;{col.name}&quot;? This cannot be undone.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                      onClick={confirmDelete}
                      disabled={saving || (colNoteCount > 0 && !destColumnId)}
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
