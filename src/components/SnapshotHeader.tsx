"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardRow } from "@/lib/boards";
import type { PlacedNoteRow } from "@/lib/placements";
import { timedLabelForDueDate } from "@/lib/dateUtils";

type Props = {
  board: BoardRow;
  highlightedNotes: PlacedNoteRow[];
  blockedCount: number;
  overdueCount: number;
  onBoardUpdate: (fields: Partial<BoardRow>) => Promise<void>;
  onHighlightToggle: (noteId: string, val: boolean) => void;
  onOpenNote: (noteId: string) => void;
};

// ── Inline editable text field ────────────────────────────────────────────────

function InlineText({
  label,
  value,
  placeholder,
  onSave,
  wide,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
  wide?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Sync when parent patches value (e.g. optimistic update propagation)
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next !== value) onSave(next);
  }

  return (
    <div className="flex flex-col gap-px">
      <span className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          className={`${wide ? "w-40" : "w-28"} min-w-0 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-px text-[11px] text-neutral-200 outline-none focus:border-indigo-600`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          className={`cursor-text rounded px-1 text-left text-[11px] hover:bg-neutral-800/60 hover:ring-1 hover:ring-neutral-700 ${value ? "text-neutral-300" : "text-neutral-600"} ${wide ? "max-w-[160px] truncate" : "max-w-[112px] truncate"}`}
          title={value ?? placeholder}
        >
          {value ?? placeholder}
        </button>
      )}
    </div>
  );
}

// ── Inline editable date field ────────────────────────────────────────────────

function InlineDate({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.showPicker?.();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  function commit(v: string) {
    setEditing(false);
    const next = v === "" ? null : v;
    if (next !== value) onSave(next);
  }

  return (
    <div className="flex flex-col gap-px">
      <span className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-px text-[11px] text-neutral-200 outline-none focus:border-indigo-600"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          className={`cursor-text rounded px-1 text-left text-[11px] hover:bg-neutral-800/60 hover:ring-1 hover:ring-neutral-700 ${value ? "text-neutral-300" : "text-neutral-600"}`}
        >
          {value ? formatDate(value) : "—"}
        </button>
      )}
    </div>
  );
}

// ── Markets tag field ─────────────────────────────────────────────────────────

function MarketsField({
  value,
  onSave,
}: {
  value: string[];
  onSave: (v: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function addMarket() {
    const t = draft.trim();
    if (t && !value.includes(t)) onSave([...value, t]);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-px">
      <span className="text-[10px] uppercase tracking-wide text-neutral-600">Markets</span>
      <div className="flex flex-wrap items-center gap-1">
        {value.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-0.5 rounded border border-neutral-700/60 bg-neutral-800/60 px-1.5 py-px text-[11px] text-neutral-300"
          >
            {m}
            <button
              type="button"
              className="leading-none text-neutral-600 hover:text-red-400"
              onClick={() => onSave(value.filter((v) => v !== m))}
              aria-label={`Remove ${m}`}
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            ref={inputRef}
            className="w-16 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-px text-[11px] text-neutral-200 outline-none focus:border-indigo-600"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addMarket}
            onKeyDown={(e) => {
              if (e.key === "Enter") addMarket();
              if (e.key === "Escape") { setDraft(""); setAdding(false); }
            }}
            placeholder="market…"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded border border-dashed border-neutral-700 px-1.5 py-px text-[11px] text-neutral-600 hover:border-neutral-500 hover:text-neutral-400"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function collapsedSummary(blocked: number, overdue: number): string {
  const parts: string[] = [];
  if (blocked > 0) parts.push(`${blocked} blocked`);
  if (overdue > 0) parts.push(`${overdue} overdue`);
  return parts.length > 0 ? parts.join(" · ") : "";
}

// ── Main component ────────────────────────────────────────────────────────────

export function SnapshotHeader({
  board,
  highlightedNotes,
  blockedCount,
  overdueCount,
  onBoardUpdate,
  onHighlightToggle,
  onOpenNote,
}: Props) {
  const collapseKey = `nb_snapshot_${board.id}`;
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(collapseKey) === "1";
  });
  const [saving, setSaving] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      if (next) localStorage.setItem(collapseKey, "1");
      else localStorage.removeItem(collapseKey);
      return next;
    });
  }

  async function saveField(fields: Partial<BoardRow>) {
    setSaving(true);
    await onBoardUpdate(fields);
    setSaving(false);
  }

  const summary = collapsedSummary(blockedCount, overdueCount);

  return (
    <div className="flex-shrink-0 border-b border-white/[0.05] bg-neutral-950/70 px-5 py-1.5 backdrop-blur-sm">

      {/* ── Single header row ── */}
      <div className="flex h-6 items-center gap-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-neutral-600 hover:text-neutral-400"
        >
          <span className="text-[8px]">{collapsed ? "▶" : "▼"}</span>
          <span>Snapshot</span>
        </button>

        <span className="text-neutral-800">·</span>

        {collapsed ? (
          /* Collapsed: one-line text summary */
          <span className="text-[11px] text-neutral-500">
            {summary || <span className="text-neutral-700">No issues</span>}
          </span>
        ) : (
          /* Expanded: styled pills */
          <div className="flex items-center gap-1.5">
            {blockedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-950/50 px-2 py-px text-[11px] text-red-400">
                <span className="h-1 w-1 rounded-full bg-red-500" />
                {blockedCount} blocked
              </span>
            )}
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/50 px-2 py-px text-[11px] text-amber-400">
                <span className="h-1 w-1 rounded-full bg-amber-500" />
                {overdueCount} overdue
              </span>
            )}
            {blockedCount === 0 && overdueCount === 0 && (
              <span className="text-[11px] text-neutral-700">No issues</span>
            )}
          </div>
        )}

        {/* Saving indicator — far right */}
        {saving && !collapsed && (
          <span className="ml-auto text-[10px] text-neutral-600">Saving…</span>
        )}
      </div>

      {/* ── Expanded body ── */}
      {!collapsed && (
        <div className="mt-1.5 space-y-2">

          {/* Row 1: Phase · Release · Premiere · Trailer */}
          <div className="flex flex-wrap items-start gap-x-5 gap-y-1.5">
            <InlineText
              label="Phase"
              value={board.campaign_phase}
              placeholder="—"
              onSave={(v) => void saveField({ campaign_phase: v })}
            />
            <InlineDate
              label="Release"
              value={board.release_date}
              onSave={(v) => void saveField({ release_date: v })}
            />
            <InlineDate
              label="Premiere"
              value={board.premiere_date}
              onSave={(v) => void saveField({ premiere_date: v })}
            />
            <InlineDate
              label="Trailer"
              value={board.trailer_debut_date}
              onSave={(v) => void saveField({ trailer_debut_date: v })}
            />
          </div>

          {/* Row 2: Markets · Notes */}
          <div className="flex flex-wrap items-start gap-x-5 gap-y-1.5">
            <div className="flex-none">
              <MarketsField
                value={board.key_markets}
                onSave={(v) => void saveField({ key_markets: v })}
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <InlineText
                label="Notes"
                value={board.snapshot_notes}
                placeholder="—"
                onSave={(v) => void saveField({ snapshot_notes: v })}
                wide
              />
            </div>
          </div>

          {/* Pinned cards strip */}
          <div>
            {highlightedNotes.length === 0 ? (
              <p className="text-[10px] text-neutral-700">
                No pinned cards — use ☆ on a card to add one.
              </p>
            ) : (
              <div className="flex items-start gap-1">
                <span className="mt-[3px] flex-shrink-0 text-[10px] uppercase tracking-wide text-neutral-600">
                  Pinned
                </span>
                <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex gap-1.5 pb-0.5">
                    {highlightedNotes.map((note) => {
                      const dueLabel = timedLabelForDueDate(note.due_date);
                      return (
                        <div
                          key={note.id}
                          className="group flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded border border-white/[0.06] bg-neutral-900/60 pl-2 pr-1 py-1 hover:border-white/[0.10] hover:bg-neutral-800/60"
                          onClick={() => onOpenNote(note.note_id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenNote(note.note_id); }}
                        >
                          <div className="min-w-0">
                            <p className="max-w-[180px] truncate text-[11px] text-neutral-200">
                              {note.content}
                            </p>
                            {dueLabel && (
                              <span className={`mt-0.5 block text-[10px] font-medium ${dueLabel.badgeClass} rounded px-1 leading-tight`}>
                                {dueLabel.label}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onHighlightToggle(note.note_id, false);
                            }}
                            className="flex-shrink-0 text-[10px] text-amber-500 opacity-0 group-hover:opacity-100 hover:text-neutral-500"
                            title="Unpin"
                          >
                            ★
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
