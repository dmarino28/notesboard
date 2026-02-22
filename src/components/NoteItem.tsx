"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlacedNoteRow } from "@/lib/placements";
import { LabelRow } from "@/lib/labels";
import { useActions } from "@/lib/ActionContext";
import { cycleActionState } from "@/lib/userActions";
import type { ActionState } from "@/lib/userActions";
import { STATUS_META } from "@/lib/collab";
import type { NoteStatus } from "@/lib/collab";

const ACTION_DOT: Record<ActionState | "none", string> = {
  none: "bg-neutral-600",
  needs_action: "bg-orange-500",
  waiting: "bg-sky-500",
  done: "bg-emerald-500",
};

const ACTION_LABEL: Record<ActionState | "none", string> = {
  none: "Mark as needs action",
  needs_action: "Needs action — click to set waiting",
  waiting: "Waiting — click to mark done",
  done: "Done — click to clear",
};

type Props = {
  note: PlacedNoteRow;
  noteLabels: LabelRow[];
  hasEmailThread?: boolean;
  onRemove: (placementId: string) => Promise<void>;
  onUpdate: (noteId: string, content: string) => Promise<void>;
  onOpen: () => void;
};

export function NoteItem({ note, noteLabels, hasEmailThread, onRemove, onUpdate, onOpen }: Props) {
  const { actionMap, onActionChange } = useActions();
  const currActionState = (actionMap[note.note_id]?.action_state ?? null) as ActionState | null;

  function handleCycleAction(e: React.MouseEvent) {
    e.stopPropagation();
    onActionChange(note.note_id, cycleActionState(currActionState));
  }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id, // placement_id
    data: { type: "NOTE" },
  });

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tintColor = noteLabels.length > 0 ? noteLabels[0].color : undefined;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.22 : undefined,
    ...(tintColor
      ? {
          backgroundColor: hexToRgba(tintColor, 0.07),
          "--label-glow": hexToRgba(tintColor, 0.12),
          "--label-glow-ring": hexToRgba(tintColor, 0.07),
        }
      : {}),
  } as React.CSSProperties;

  async function handleSave() {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(note.note_id, trimmed);
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

  async function handleRemove() {
    if (!confirm("Remove from this board?")) return;
    await onRemove(note.id);
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!editing) onOpen();
      }}
      className={`group cursor-grab active:cursor-grabbing rounded-xl border border-white/[0.07] bg-neutral-800/60 p-3 shadow-sm shadow-black/30 transition-all duration-200 ease-out hover:scale-[1.01] hover:border-white/[0.12] hover:bg-neutral-800/80 hover:shadow-md hover:shadow-black/45${tintColor ? " nb-card-glow" : ""}`}
    >
      {editing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="w-full rounded-lg border border-white/[0.12] bg-neutral-800 p-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-indigo-500/40"
            rows={3}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            disabled={saving}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !editContent.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="rounded-lg border border-white/[0.08] px-3 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
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
          <p className="whitespace-pre-wrap text-sm leading-tight text-neutral-100">{note.content}</p>

          {(note.due_date || note.event_start || note.status) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {note.status && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_META[note.status as NoteStatus]?.badgeClass ?? "bg-neutral-800/60 text-neutral-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_META[note.status as NoteStatus]?.dotClass ?? "bg-neutral-500"}`}
                  />
                  {STATUS_META[note.status as NoteStatus]?.label ?? note.status}
                </span>
              )}
              {note.due_date && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isPast(note.due_date)
                      ? "bg-red-950/60 text-red-400"
                      : "bg-neutral-800/60 text-neutral-500"
                  }`}
                >
                  Due {formatDateOnly(note.due_date)}
                </span>
              )}
              {note.event_start && (
                <span className="inline-flex items-center rounded-full bg-neutral-800/60 px-2 py-0.5 text-[11px] text-neutral-500">
                  {note.event_end
                    ? formatDateRange(note.event_start, note.event_end)
                    : formatDateOnly(note.event_start)}
                </span>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {/* Per-user action state — 1-click cycle */}
              <button
                type="button"
                onClick={handleCycleAction}
                title={ACTION_LABEL[currActionState ?? "none"]}
                className={`transition-opacity duration-150 ${!currActionState ? "opacity-0 group-hover:opacity-100" : ""}`}
              >
                <span
                  className={`block h-2 w-2 rounded-full transition-colors duration-150 ${ACTION_DOT[currActionState ?? "none"]}`}
                />
              </button>
              {hasEmailThread && (
                <span className="text-[11px] leading-none text-neutral-600" title="Email thread linked">✉</span>
              )}
              {note.placement_count > 1 && (
                <span
                  className="text-[11px] leading-none text-neutral-600"
                  title={`On ${note.placement_count} boards`}
                >
                  ⬡
                </span>
              )}
              {note.last_public_activity_at && (
                <span
                  className="text-[10px] text-neutral-700"
                  title={note.last_public_activity_preview ?? ""}
                >
                  {relativeTimeShort(note.last_public_activity_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <button
                className="text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
              >
                Edit
              </button>
              <button
                className="text-[11px] text-neutral-600 transition-colors hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRemove();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function relativeTimeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
