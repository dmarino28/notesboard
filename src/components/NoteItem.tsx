"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NoteRow } from "@/lib/notes";
import { ColumnRow } from "@/lib/columns";
import { LabelRow } from "@/lib/labels";

type Props = {
  note: NoteRow;
  allColumns: ColumnRow[];
  noteLabels: LabelRow[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, content: string) => Promise<void>;
  onMove: (id: string, columnId: string) => Promise<void>;
  onOpen: () => void;
};

export function NoteItem({ note, allColumns, noteLabels, onDelete, onUpdate, onMove, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    data: { type: "NOTE" },
  });

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
  };

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

  async function handleMove(e: React.ChangeEvent<HTMLSelectElement>) {
    const targetId = e.target.value;
    if (!targetId) return;
    setMoving(true);
    setMoveTarget(targetId);
    await onMove(note.id, targetId);
    setMoveTarget("");
    setMoving(false);
  }

  const otherColumns = allColumns.filter((c) => c.id !== note.column_id);

  // Label indicators: up to 3 colour swatches then "+N"
  const shownLabels = noteLabels.slice(0, 3);
  const extraLabels = noteLabels.length > 3 ? noteLabels.length - 3 : 0;

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!editing) onOpen();
      }}
      className="group cursor-pointer rounded-md border border-neutral-800 bg-neutral-950 p-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
    >
      {editing ? (
        // Stop propagation so clicks inside the edit form don't re-open the modal
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
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
          {/* Label colour swatches */}
          {noteLabels.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {shownLabels.map((label) => (
                <span
                  key={label.id}
                  className="h-1.5 w-8 rounded-full"
                  style={{ backgroundColor: label.color }}
                  title={label.name}
                />
              ))}
              {extraLabels > 0 && (
                <span className="text-xs text-neutral-600">+{extraLabels}</span>
              )}
            </div>
          )}

          <p className="whitespace-pre-wrap text-sm">{note.content}</p>

          {/* Date / event indicators */}
          {(note.due_date || note.event_start) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {note.due_date && (
                <span
                  className={`text-xs ${isPast(note.due_date) ? "text-red-400" : "text-neutral-500"}`}
                >
                  Due {formatDate(note.due_date)}
                </span>
              )}
              {note.event_start && (
                <span className="text-xs text-neutral-500">
                  {formatDate(note.event_start)}
                  {note.event_end ? ` – ${formatDate(note.event_end)}` : ""}
                </span>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              {new Date(note.created_at).toLocaleString()}
            </p>
            <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              {otherColumns.length > 0 && (
                <select
                  className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs text-neutral-400 disabled:opacity-50"
                  value={moveTarget}
                  onChange={handleMove}
                  disabled={moving}
                  title="Move to column"
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">Move…</option>
                  {otherColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="text-xs text-neutral-400 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
              >
                Edit
              </button>
              <button
                className="text-xs text-red-500 hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString(undefined, { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  const time = d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${month} ${day}, ${year} ${time}`;
}

function isPast(iso: string): boolean {
  return new Date(iso) < new Date();
}
