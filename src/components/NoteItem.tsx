"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";

type Props = {
  note: NoteRow;
  noteLabels: LabelRow[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, content: string) => Promise<void>;
  onOpen: () => void;
};

export function NoteItem({ note, noteLabels, onDelete, onUpdate, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    data: { type: "NOTE" },
  });

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accentColor = noteLabels.length > 0 ? noteLabels[0].color : undefined;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : undefined,
    ...(accentColor ? { borderLeft: `3px solid ${accentColor}` } : {}),
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
      className="group cursor-pointer rounded-lg border border-neutral-200/80 bg-white p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-neutral-300"
    >
      {editing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="w-full rounded border border-neutral-300 bg-white p-2 text-sm text-neutral-900 outline-none focus:border-neutral-500"
            rows={3}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            disabled={saving}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !editContent.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>
      ) : (
        <>
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
                <span className="text-xs text-neutral-400">+{extraLabels}</span>
              )}
            </div>
          )}

          <p className="whitespace-pre-wrap text-sm leading-snug text-neutral-900">{note.content}</p>

          {(note.due_date || note.event_start) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {note.due_date && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isPast(note.due_date)
                      ? "bg-red-100 text-red-600"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  Due {formatDateOnly(note.due_date)}
                </span>
              )}
              {note.event_start && (
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  {note.event_end
                    ? formatDateRange(note.event_start, note.event_end)
                    : formatDateOnly(note.event_start)}
                </span>
              )}
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
              >
                Edit
              </button>
              <button
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
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

function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sMonth = s.toLocaleDateString(undefined, { month: "short" });
  const sDay = s.getDate();
  const eMonth = e.toLocaleDateString(undefined, { month: "short" });
  const eDay = e.getDate();
  const eYear = e.getFullYear();
  if (s.getFullYear() === eYear) {
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${eYear}`;
  }
  return `${sMonth} ${sDay}, ${s.getFullYear()} – ${eMonth} ${eDay}, ${eYear}`;
}

function isPast(iso: string): boolean {
  return new Date(iso) < new Date();
}
