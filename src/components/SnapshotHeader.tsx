"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardRow, ReleaseScheduleItem } from "@/lib/boards";
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
    <div className="flex flex-col gap-[3px]">
      <span className="text-[10px] uppercase tracking-[0.08em] text-neutral-600">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          className={`${wide ? "w-40" : "w-28"} min-w-0 rounded border border-neutral-700 bg-neutral-800/80 px-1.5 py-px text-[11px] text-neutral-200 outline-none focus:border-indigo-600/70`}
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
          className={`cursor-text border-b border-transparent pb-px text-left text-[11px] transition-colors duration-100 hover:border-neutral-700/60 ${value ? "text-neutral-200" : "text-neutral-700"} ${wide ? "max-w-[160px] truncate" : "max-w-[112px] truncate"}`}
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
    <div className="flex flex-col gap-[3px]">
      <span className="text-[10px] uppercase tracking-[0.08em] text-neutral-600">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          className="rounded border border-neutral-700 bg-neutral-800/80 px-1.5 py-px text-[11px] text-neutral-200 outline-none focus:border-indigo-600/70"
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
          className={`cursor-text border-b border-transparent pb-px text-left text-[11px] transition-colors duration-100 hover:border-neutral-700/60 ${value ? "text-neutral-200" : "text-neutral-700"}`}
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
    <div className="flex flex-col gap-[3px]">
      <span className="text-[10px] uppercase tracking-[0.08em] text-neutral-600">Markets</span>
      <div className="flex flex-wrap items-center gap-1">
        {value.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-0.5 rounded border border-white/[0.07] bg-neutral-800/40 px-1.5 py-px text-[11px] text-neutral-200"
          >
            {m}
            <button
              type="button"
              className="leading-none text-neutral-500 transition-colors duration-100 hover:text-red-400"
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
            className="w-16 rounded border border-neutral-700 bg-neutral-800/80 px-1.5 py-px text-[11px] text-neutral-200 outline-none focus:border-indigo-600/70"
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
            className="rounded border border-dashed border-neutral-700/50 px-1.5 py-px text-[11px] text-neutral-700 transition-colors duration-100 hover:border-neutral-600 hover:text-neutral-400"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

// ── Release Dates popover ─────────────────────────────────────────────────────

function ReleaseDatesPopover({
  boardId,
  schedule,
  onScheduleChange,
}: {
  boardId: string;
  schedule: ReleaseScheduleItem[];
  onScheduleChange: (rows: ReleaseScheduleItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const regions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of schedule) {
      if (item.region && !seen.has(item.region)) {
        seen.add(item.region);
        out.push(item.region);
      }
    }
    return out;
  }, [schedule]);

  const filtered = useMemo(() => {
    let rows = schedule;
    if (regionFilter) rows = rows.filter((r) => r.region === regionFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.territory.toLowerCase().includes(q));
    }
    return rows;
  }, [schedule, regionFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReleaseScheduleItem[]>();
    for (const item of filtered) {
      const key = item.region ?? "(No region)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [filtered]);

  async function callImportApi(
    body: BodyInit,
    headers?: HeadersInit,
  ): Promise<boolean> {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/import-release-schedule`, {
        method: "POST",
        body,
        ...(headers ? { headers } : {}),
      });

      type ApiResponse = {
        rows?: ReleaseScheduleItem[];
        count?: number;
        warning?: string;
        message?: string;
        error_code?: string;
        extractedTextPreview?: string;
      };

      let json: ApiResponse;
      try {
        json = (await res.json()) as ApiResponse;
      } catch {
        setImportError("Server returned an unreadable response");
        return false;
      }

      if (!res.ok) {
        setImportError(json.message ?? "Import failed");
        return false;
      }

      if (json.warning === "no_rows_detected") {
        setImportError(
          "Couldn't detect a schedule in this PDF. Try the Paste text fallback.",
        );
        return false;
      }

      onScheduleChange(json.rows ?? []);
      setRegionFilter(null);
      setSearch("");
      return true;
    } catch {
      setImportError("Network error — check your connection and try again");
      return false;
    } finally {
      setImporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await callImportApi(form);
    e.target.value = "";
  }

  async function handlePaste() {
    if (!pasteText.trim()) return;
    const ok = await callImportApi(pasteText, { "Content-Type": "text/plain" });
    if (ok) {
      setPasteText("");
      setPasteMode(false);
    }
  }

  function formatDisplayDate(item: ReleaseScheduleItem): { text: string; cls: string } {
    if (item.tba) return { text: "TBA", cls: "text-amber-400/80" };
    if (item.no_release) return { text: "No Release", cls: "text-neutral-600" };
    if (item.date) return { text: formatDateShort(item.date), cls: "text-neutral-400" };
    return { text: "—", cls: "text-neutral-700" };
  }

  const label =
    schedule.length > 0
      ? `Release Dates · ${schedule.length} ▾`
      : "Release Dates ▾";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-neutral-800/80 px-1.5 py-px text-[11px] text-neutral-600 transition-colors duration-100 hover:border-neutral-700 hover:text-neutral-400"
      >
        {label}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-white/[0.07] bg-neutral-950 shadow-2xl shadow-black/70 ring-1 ring-black/20"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2.5">
            <span className="text-[11px] font-medium tracking-wide text-neutral-400">Release Dates</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[13px] leading-none text-neutral-700 transition-colors duration-100 hover:text-neutral-400"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {schedule.length === 0 ? (
            <div className="px-3 py-5 text-center">
              <p className="text-[11px] text-neutral-700">No schedule imported yet.</p>
            </div>
          ) : (
            <>
              {/* Region filter chips */}
              {regions.length > 1 && (
                <div className="flex flex-wrap gap-1 border-b border-white/[0.05] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setRegionFilter(null)}
                    className={`rounded px-2 py-px text-[10px] tracking-wide transition-colors duration-100 ${
                      regionFilter === null
                        ? "bg-indigo-950/60 text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
                        : "text-neutral-600 hover:text-neutral-400"
                    }`}
                  >
                    All
                  </button>
                  {regions.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRegionFilter(regionFilter === r ? null : r)}
                      className={`rounded px-2 py-px text-[10px] tracking-wide transition-colors duration-100 ${
                        regionFilter === r
                          ? "bg-indigo-950/60 text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
                          : "text-neutral-600 hover:text-neutral-400"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="border-b border-white/[0.05] px-3 py-1.5">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search territory…"
                  className="w-full rounded border border-white/[0.05] bg-neutral-800/50 px-2 py-px text-[11px] text-neutral-300 placeholder:text-neutral-700 outline-none focus:border-indigo-500/30"
                />
              </div>

              {/* Territory list */}
              <div className="max-h-60 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[11px] text-neutral-700">
                    No territories match.
                  </p>
                ) : (
                  <div className="py-1">
                    {Array.from(grouped.entries()).map(([region, items]) => (
                      <div key={region}>
                        <div className="px-3 pb-0.5 pt-2 text-[10px] tracking-[0.1em] text-neutral-700 uppercase first:pt-1">
                          {region}
                        </div>
                        {items.map((item) => {
                          const { text, cls } = formatDisplayDate(item);
                          return (
                            <div
                              key={item.territory}
                              className="flex items-center justify-between px-3 py-[3px] transition-colors duration-75 hover:bg-white/[0.02]"
                            >
                              <span className="min-w-0 truncate text-[11px] text-neutral-300">
                                {item.territory}
                              </span>
                              <span className={`ml-2 flex-shrink-0 tabular-nums text-[11px] ${cls}`}>
                                {text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer: import controls */}
          <div className="space-y-1.5 border-t border-white/[0.05] px-3 py-2.5">
            {importError && (
              <p className="text-[11px] leading-snug text-red-400/80">{importError}</p>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                className="rounded border border-neutral-700/60 px-2 py-px text-[11px] text-neutral-500 transition-colors duration-100 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-40"
              >
                {importing ? "Importing…" : "Import PDF"}
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => { setPasteMode((v) => !v); setImportError(null); }}
                className={`rounded border px-2 py-px text-[11px] transition-colors duration-100 disabled:opacity-40 ${
                  pasteMode
                    ? "border-indigo-800/60 text-indigo-400"
                    : "border-neutral-700/60 text-neutral-600 hover:border-neutral-600 hover:text-neutral-400"
                }`}
              >
                Paste text
              </button>
            </div>

            {pasteMode && (
              <div className="space-y-1.5">
                <textarea
                  rows={5}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste raw PDF text here…"
                  className="w-full resize-none rounded border border-white/[0.06] bg-neutral-800/50 px-2 py-1 text-[11px] text-neutral-200 placeholder:text-neutral-700 outline-none focus:border-indigo-500/30"
                />
                <button
                  type="button"
                  disabled={importing || !pasteText.trim()}
                  onClick={() => void handlePaste()}
                  className="rounded bg-indigo-600 px-2.5 py-px text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
                >
                  {importing ? "Parsing…" : "Parse"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y.slice(2)}`;
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
    // Left accent bar via border-l; pl compensated so content alignment is unchanged
    <div className="flex-shrink-0 border-b border-l-2 border-b-white/[0.05] border-l-indigo-900/25 bg-neutral-950/70 py-1.5 pl-[18px] pr-5 backdrop-blur-sm">

      {/* ── Single header row ── */}
      <div className="flex h-6 items-center gap-2.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400/70 transition-colors duration-100 hover:text-neutral-300"
        >
          <span className="text-[7px] text-neutral-600">{collapsed ? "▶" : "▼"}</span>
          <span>Snapshot</span>
        </button>

        <span className="select-none text-neutral-700">·</span>

        {collapsed ? (
          /* Collapsed: concise status text — reads as a compressed control bar */
          <span className="text-[11px] tracking-wide text-neutral-400">
            {summary || <span className="text-neutral-600">—</span>}
          </span>
        ) : (
          /* Expanded: status chips with depth */
          <div className="flex items-center gap-1.5">
            {blockedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-red-900/25 bg-red-950/40 px-2 py-0.5 text-[11px] text-red-400/90 shadow-[0_0_10px_rgba(239,68,68,0.06)]">
                <span className="h-[5px] w-[5px] rounded-full bg-red-500/70 shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
                {blockedCount} blocked
              </span>
            )}
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-900/25 bg-amber-950/40 px-2 py-0.5 text-[11px] text-amber-400/80 shadow-[0_0_10px_rgba(245,158,11,0.05)]">
                <span className="h-[5px] w-[5px] rounded-full bg-amber-500/70 shadow-[0_0_4px_rgba(245,158,11,0.4)]" />
                {overdueCount} overdue
              </span>
            )}
            {blockedCount === 0 && overdueCount === 0 && (
              <span className="text-[11px] tracking-wide text-neutral-700">No issues</span>
            )}
          </div>
        )}

        {/* Release Dates popover */}
        <ReleaseDatesPopover
          boardId={board.id}
          schedule={board.release_schedule}
          onScheduleChange={(rows) => void onBoardUpdate({ release_schedule: rows })}
        />

        {/* Saving indicator */}
        {saving && !collapsed && (
          <span className="ml-auto text-[10px] tracking-wide text-neutral-600">Saving…</span>
        )}
      </div>

      {/* ── Expanded body ── */}
      {!collapsed && (
        <div className="mt-2 space-y-2.5">

          {/* Row 1: Phase · Release · Premiere · Trailer */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
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
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <div className="flex-none">
              <MarketsField
                value={board.key_markets}
                onSave={(v) => void saveField({ key_markets: v })}
              />
            </div>
            <div className="min-w-[120px] flex-1">
              <InlineText
                label="Notes"
                value={board.snapshot_notes}
                placeholder="—"
                onSave={(v) => void saveField({ snapshot_notes: v })}
                wide
              />
            </div>
          </div>

          {/* Pinned cards — subtle top divider separates from field rows */}
          <div className="border-t border-white/[0.04] pt-1.5">
            {highlightedNotes.length === 0 ? (
              <p className="text-[10px] text-neutral-700">
                No pinned cards — use ☆ on a card to pin one.
              </p>
            ) : (
              <div className="flex items-start gap-1.5">
                <span className="mt-[3px] flex-shrink-0 text-[10px] uppercase tracking-[0.08em] text-neutral-700">
                  Pinned
                </span>
                <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex gap-1.5 pb-0.5">
                    {highlightedNotes.map((note) => {
                      const dueLabel = timedLabelForDueDate(note.due_date);
                      return (
                        <div
                          key={note.id}
                          className="group flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded border border-white/[0.07] bg-neutral-900/80 py-1 pl-2 pr-1 shadow-sm shadow-black/40 transition-colors duration-100 hover:border-white/[0.12] hover:bg-neutral-800/70"
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
                              <span className={`mt-0.5 block rounded px-1 text-[10px] font-medium leading-tight ${dueLabel.badgeClass}`}>
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
                            className="flex-shrink-0 text-[10px] text-amber-500 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-neutral-500"
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
