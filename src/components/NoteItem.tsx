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
import { timedLabelForDueDate, relativeTimeShort, isWithin24h } from "@/lib/dateUtils";

const ACTION_DOT: Record<ActionState, string> = {
  needs_action: "bg-orange-400",
  waiting: "bg-sky-400",
  done: "bg-emerald-400",
};

const ACTION_BADGE: Record<ActionState, string> = {
  needs_action: "bg-orange-950/60 text-orange-400 border border-orange-900/30",
  waiting: "bg-sky-950/60 text-sky-400 border border-sky-900/30",
  done: "bg-emerald-950/60 text-emerald-400 border border-emerald-900/30",
};

const ACTION_TEXT: Record<ActionState, string> = {
  needs_action: "Action",
  waiting: "Waiting",
  done: "Done",
};

type Props = {
  note: PlacedNoteRow;
  noteLabels: LabelRow[];
  hasEmailThread?: boolean;
  onRemove: (placementId: string) => Promise<void>;
  onUpdate: (noteId: string, content: string) => Promise<void>;
  onOpen: () => void;
  onMoveRequest?: (placementId: string) => void;
};

export function NoteItem({ note, noteLabels, hasEmailThread, onRemove, onUpdate, onOpen, onMoveRequest }: Props) {
  const { actionMap, awarenessMap, onActionChange } = useActions();
  const currActionState = (actionMap[note.note_id]?.action_state ?? null) as ActionState | null;

  // ── Unseen dot ──────────────────────────────────────────────────────────────
  // Show if the note has been updated and the user has never viewed it (or viewed before the update).
  const awareness = awarenessMap[note.note_id];
  const isUnseen = Boolean(
    note.updated_at &&
    (
      !awareness ||
      awareness.last_viewed_at === null ||
      note.updated_at > awareness.last_viewed_at
    ),
  );

  // ── Timed label ─────────────────────────────────────────────────────────────
  const timedLabel = timedLabelForDueDate(note.due_date);

  // ── "Last updated" display ──────────────────────────────────────────────────
  // Prefer last_public_activity_at (collab updates); fall back to updated_at (any edit).
  const displayTime = note.last_public_activity_at ?? note.updated_at;
  const displayIsRecent = displayTime ? isWithin24h(displayTime) : false;

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
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const tintColor = noteLabels.length > 0 ? noteLabels[0].color : undefined;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : undefined,
    filter: isDragging ? "brightness(1.1)" : undefined,
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
      className={`group relative cursor-grab active:cursor-grabbing rounded-xl border border-white/[0.07] bg-neutral-800/60 p-3 shadow-sm shadow-black/30 transition-all duration-150 ease-out hover:scale-[1.01] hover:border-white/[0.12] hover:bg-neutral-800/80 hover:shadow-md hover:shadow-black/45${tintColor ? " nb-card-glow" : ""}${isDragging ? " scale-[1.02] shadow-2xl ring-1 ring-indigo-400/30" : ""}`}
    >
      {/* Per-user unseen dot — indigo, top-right */}
      {isUnseen && (
        <span
          className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50"
          aria-label="Updated since last view"
        />
      )}

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
              {/* Timed label replaces raw due-date text — bucket colors match ActionsBoard columns */}
              {timedLabel && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${timedLabel.badgeClass}`}
                >
                  {timedLabel.label}
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
              {/* Action pill — shown for needs_action and waiting; Done is hidden on board cards */}
              {currActionState && currActionState !== "done" && (
                <button
                  type="button"
                  onClick={handleCycleAction}
                  title={`${ACTION_TEXT[currActionState]} — click to advance`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${ACTION_BADGE[currActionState]}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${ACTION_DOT[currActionState]}`} />
                  {ACTION_TEXT[currActionState]}
                </button>
              )}
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
              {/* Last updated — green + semi-bold if within 24h */}
              {displayTime && (
                <span
                  className={`text-[10px] ${
                    displayIsRecent
                      ? "font-medium text-emerald-600"
                      : "text-neutral-700"
                  }`}
                  title={note.last_public_activity_preview ?? ""}
                >
                  {relativeTimeShort(displayTime)}
                </span>
              )}
            </div>
            {/* Mobile: three-dot menu trigger */}
            <button
              type="button"
              className="sm:hidden rounded-md px-1 text-base leading-none text-neutral-500 transition-colors hover:text-neutral-300"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setShowMobileMenu(true); }}
              aria-label="Card actions"
            >
              ···
            </button>

            {/* Desktop: hover-reveal action row */}
            <div className="hidden sm:flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {!currActionState && (
                <button
                  type="button"
                  className="text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
                  onClick={(e) => { e.stopPropagation(); onActionChange(note.note_id, "needs_action"); }}
                >
                  + Actions
                </button>
              )}
              <button
                type="button"
                className="text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-[11px] text-neutral-600 transition-colors hover:text-red-400"
                onClick={(e) => { e.stopPropagation(); void handleRemove(); }}
              >
                Remove
              </button>
            </div>
          </div>

          {/* Mobile card actions sheet */}
          {showMobileMenu && (
            <MobileCardActionsSheet
              hasAction={!!currActionState}
              onAddAction={() => { onActionChange(note.note_id, "needs_action"); setShowMobileMenu(false); }}
              onEdit={() => { setEditing(true); setShowMobileMenu(false); }}
              onRemove={() => { void handleRemove(); setShowMobileMenu(false); }}
              onMove={onMoveRequest ? () => { onMoveRequest!(note.id); setShowMobileMenu(false); } : undefined}
              onClose={() => setShowMobileMenu(false)}
            />
          )}
        </>
      )}
    </li>
  );
}

// ─── Mobile card actions bottom sheet ────────────────────────────────────────

function MobileCardActionsSheet({
  hasAction,
  onAddAction,
  onEdit,
  onRemove,
  onMove,
  onClose,
}: {
  hasAction: boolean;
  onAddAction: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove?: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onMouseDown={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-x border-t border-white/[0.08] bg-neutral-900 shadow-2xl">
        <ul className="py-2">
          {!hasAction && (
            <li>
              <button
                type="button"
                onClick={onAddAction}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-neutral-300 transition-colors hover:bg-white/[0.05]"
              >
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                Add to My Actions
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={onEdit}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-neutral-300 transition-colors hover:bg-white/[0.05]"
            >
              Edit card
            </button>
          </li>
          {onMove && (
            <li>
              <button
                type="button"
                onClick={onMove}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-neutral-300 transition-colors hover:bg-white/[0.05]"
              >
                Move to list…
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={onRemove}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 transition-colors hover:bg-white/[0.05]"
            >
              Remove from board
            </button>
          </li>
        </ul>
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </div>
    </>
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
