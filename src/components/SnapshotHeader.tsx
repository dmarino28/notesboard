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
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next !== value) onSave(next);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          className="w-full min-w-0 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-200 outline-none focus:border-indigo-600"
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
          className={`text-left text-xs transition-colors hover:text-neutral-200 ${value ? "text-neutral-300" : "text-neutral-600"}`}
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

  function commit(v: string) {
    setEditing(false);
    const next = v === "" ? null : v;
    if (next !== value) onSave(next);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-200 outline-none focus:border-indigo-600"
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
          className={`text-left text-xs transition-colors hover:text-neutral-200 ${value ? "text-neutral-300" : "text-neutral-600"}`}
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

  function removeMarket(m: string) {
    onSave(value.filter((v) => v !== m));
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-neutral-600">Markets</span>
      <div className="flex flex-wrap items-center gap-1">
        {value.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-0.5 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
          >
            {m}
            <button
              type="button"
              className="text-neutral-500 hover:text-red-400"
              onClick={() => removeMarket(m)}
              aria-label={`Remove ${m}`}
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            ref={inputRef}
            className="w-20 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200 outline-none focus:border-indigo-600"
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
            className="rounded-full border border-dashed border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-600 hover:border-neutral-500 hover:text-neutral-400"
          >
            + Add
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

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      if (next) localStorage.setItem(collapseKey, "1");
      else localStorage.removeItem(collapseKey);
      return next;
    });
  }

  const hasIssues = blockedCount > 0 || overdueCount > 0;

  return (
    <div className="flex-shrink-0 border-b border-white/[0.06] bg-neutral-950/80 px-5 py-2 backdrop-blur-sm">
      {/* ── Header row ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <span>{collapsed ? "▶" : "▼"}</span>
          <span>Snapshot</span>
        </button>

        {/* Health pills — always visible even when collapsed */}
        <div className="flex items-center gap-2">
          {blockedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-950/60 px-2 py-0.5 text-[11px] font-medium text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {blockedCount} blocked
            </span>
          )}
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2 py-0.5 text-[11px] font-medium text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {overdueCount} overdue
            </span>
          )}
          {!hasIssues && !collapsed && (
            <span className="text-[11px] text-neutral-700">No blockers</span>
          )}
        </div>
      </div>

      {/* ── Expanded body ── */}
      {!collapsed && (
        <div className="mt-2 space-y-3">
          {/* Manual fields row */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <InlineText
              label="Phase"
              value={board.campaign_phase}
              placeholder="—"
              onSave={(v) => void onBoardUpdate({ campaign_phase: v })}
            />
            <InlineDate
              label="Release"
              value={board.release_date}
              onSave={(v) => void onBoardUpdate({ release_date: v })}
            />
            <InlineDate
              label="Premiere"
              value={board.premiere_date}
              onSave={(v) => void onBoardUpdate({ premiere_date: v })}
            />
            <InlineDate
              label="Trailer"
              value={board.trailer_debut_date}
              onSave={(v) => void onBoardUpdate({ trailer_debut_date: v })}
            />
            <MarketsField
              value={board.key_markets}
              onSave={(v) => void onBoardUpdate({ key_markets: v })}
            />
            <InlineText
              label="Notes"
              value={board.snapshot_notes}
              placeholder="—"
              onSave={(v) => void onBoardUpdate({ snapshot_notes: v })}
            />
          </div>

          {/* Highlighted cards strip */}
          <div>
            <span className="text-[10px] uppercase tracking-wide text-neutral-600">Pinned cards</span>
            {highlightedNotes.length === 0 ? (
              <p className="mt-1 text-[11px] text-neutral-700">
                No cards pinned. Use ☆ on any card to pin it here.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-2">
                {highlightedNotes.map((note) => {
                  const dueLabel = timedLabelForDueDate(note.due_date);
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => onOpenNote(note.note_id)}
                      className="group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-neutral-900/60 px-2.5 py-1.5 text-left transition-colors hover:border-white/[0.10] hover:bg-neutral-800/60"
                    >
                      <div className="min-w-0">
                        <p className="max-w-[220px] truncate text-[12px] text-neutral-200">
                          {note.content}
                        </p>
                        {dueLabel && (
                          <span className={`text-[10px] font-medium ${dueLabel.badgeClass} rounded px-1`}>
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
                        className="flex-shrink-0 text-[11px] text-amber-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neutral-400"
                        title="Unpin"
                      >
                        ★
                      </button>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
