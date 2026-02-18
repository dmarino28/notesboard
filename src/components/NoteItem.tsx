"use client";

import { useState } from "react";
import { NoteRow } from "@/lib/notes";

type Props = {
  note: NoteRow;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, content: string) => Promise<void>;
};

export function NoteItem({ note, onDelete, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(note.id, trimmed);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditContent(note.content);
    setError(null);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this note?")) return;
    await onDelete(note.id);
  }

  return (
    <li className="group rounded-md border border-neutral-800 bg-neutral-950 p-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900">
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm outline-none focus:border-neutral-600"
            rows={3}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            disabled={saving}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-white px-3 py-1 text-xs font-medium text-black disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !editContent.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 disabled:opacity-50"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm">{note.content}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              {new Date(note.created_at).toLocaleString()}
            </p>
            <div className="flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                className="text-xs text-neutral-400 hover:text-white"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                className="text-xs text-red-500 hover:text-red-400"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}
