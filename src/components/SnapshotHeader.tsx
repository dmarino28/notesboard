"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BoardRow, ReleaseScheduleItem } from "@/lib/boards";
import type { PlacedNoteRow } from "@/lib/placements";
import { timedLabelForDueDate } from "@/lib/dateUtils";
import { BoardBriefingPanel } from "@/components/BoardBriefingPanel";

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
      <span className="text-[10px] uppercase tracking-[0.08em] text-gray-400">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          className={`${wide ? "w-40" : "w-28"} min-w-0 rounded border border-gray-300 bg-white px-1.5 py-px text-[11px] text-gray-800 outline-none focus:border-indigo-400`}
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
          className={`cursor-text border-b border-transparent pb-px text-left text-[11px] transition-colors duration-100 hover:border-gray-300 ${value ? "text-gray-700" : "text-gray-300"} ${wide ? "max-w-[160px] truncate" : "max-w-[112px] truncate"}`}
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
      <span className="text-[10px] uppercase tracking-[0.08em] text-gray-400">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          className="rounded border border-gray-300 bg-white px-1.5 py-px text-[11px] text-gray-800 outline-none focus:border-indigo-400"
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
          className={`cursor-text border-b border-transparent pb-px text-left text-[11px] transition-colors duration-100 hover:border-gray-300 ${value ? "text-gray-700" : "text-gray-300"}`}
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
      <span className="text-[10px] uppercase tracking-[0.08em] text-gray-400">Markets</span>
      <div className="flex flex-wrap items-center gap-1">
        {value.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-100 px-1.5 py-px text-[11px] text-gray-700"
          >
            {m}
            <button
              type="button"
              className="leading-none text-gray-400 transition-colors duration-100 hover:text-red-500"
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
            className="w-16 rounded border border-gray-300 bg-white px-1.5 py-px text-[11px] text-gray-800 outline-none focus:border-indigo-400"
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
            className="rounded border border-dashed border-gray-300 px-1.5 py-px text-[11px] text-gray-400 transition-colors duration-100 hover:border-gray-400 hover:text-gray-600"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

// ── Blocks paste helpers ──────────────────────────────────────────────────────

type BlocksPreviewRow = { territory: string; dateDisplay: string } & Pick<
  ReleaseScheduleItem,
  "date" | "tba" | "no_release"
>;

const BLOCKS_DATE_RE = /^(\d{1,2}-[A-Za-z]{3}-\d{2,4}|TBA|No\s+Release|N\/R)$/i;
const BLOCKS_MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function blockNormalizeDate(
  raw: string,
): Pick<ReleaseScheduleItem, "date" | "tba" | "no_release"> & { display: string } {
  const t = raw.trim();
  if (/^TBA$/i.test(t)) return { date: null, tba: true, no_release: false, display: "TBA" };
  if (/^(No\s+Release|N\/R)$/i.test(t)) return { date: null, tba: false, no_release: true, display: "No Release" };
  const m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = BLOCKS_MONTH_MAP[m[2].toLowerCase()];
    if (!month) return { date: null, tba: false, no_release: false, display: t };
    let year = m[3];
    if (year.length === 2) year = parseInt(year, 10) <= 50 ? `20${year}` : `19${year}`;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const display = `${months[Number(month) - 1]} ${Number(day)}, ${year.slice(2)}`;
    return { date: `${year}-${month}-${day}`, tba: false, no_release: false, display };
  }
  return { date: null, tba: false, no_release: false, display: t };
}

const BLOCKS_NOISE_RE = [
  /^\d+$/,
  /territory[\s\S]*release[\s\S]*date/i,
  /privileged|confidential|internal only|do not distribute/i,
  /page\s+\d+/i,
  /^©/,
  /^[-–—]+$/,
  /international release schedule/i,
  /prepared\s+on/i,
  /^[>^*]/,
  /=\s*released/i,
  /^(region|territory|release\s+date)$/i,
];

function blockIsNoise(line: string): boolean {
  return BLOCKS_NOISE_RE.some((re) => re.test(line));
}

function parseBlocksTerritory(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !blockIsNoise(l) && !BLOCKS_DATE_RE.test(l));
}

function parseBlocksDates(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => BLOCKS_DATE_RE.test(l));
}

// ── Release Dates popover ─────────────────────────────────────────────────────

const POPOVER_W = 320; // matches w-80

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [pasteMode, setPasteMode] = useState<"none" | "text" | "blocks">("none");
  const [pasteText, setPasteText] = useState("");
  const [blocksA, setBlocksA] = useState("");
  const [blocksB, setBlocksB] = useState("");
  const [blocksPreview, setBlocksPreview] = useState<BlocksPreviewRow[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Open / close ────────────────────────────────────────────────────────────

  function openPopover() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.left, window.innerWidth - POPOVER_W - 16);
    setPos({ top: rect.bottom + 6, left });
    setOpen(true);
  }

  function closePopover() {
    setOpen(false);
    setPos(null);
  }

  // Outside click → close
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!popoverRef.current?.contains(t) && !triggerRef.current?.contains(t)) {
        setOpen(false);
        setPos(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Any external scroll → close (ignore scroll inside the popover itself)
  useEffect(() => {
    if (!open) return;
    function onScroll(e: Event) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setPos(null);
    }
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [open]);

  // Escape → close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setPos(null); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Region order: stable, first appearance in schedule
  const regionOrder = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of schedule) {
      const k = item.region ?? "(NO REGION)";
      if (!seen.has(k)) { seen.add(k); out.push(k); }
    }
    return out;
  }, [schedule]);

  // Named regions only — used by filter chips
  const namedRegions = useMemo(
    () => regionOrder.filter((r) => r !== "(NO REGION)"),
    [regionOrder],
  );

  // Filtered rows → grouped by region (preserving regionOrder) → sorted within group
  const groups = useMemo(() => {
    let rows = schedule;
    if (regionFilter) rows = rows.filter((r) => (r.region ?? "(NO REGION)") === regionFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.territory.toLowerCase().includes(q));
    }

    const map = new Map<string, ReleaseScheduleItem[]>();
    for (const k of regionOrder) map.set(k, []);
    for (const item of rows) {
      const k = item.region ?? "(NO REGION)";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }

    const result: { region: string; items: ReleaseScheduleItem[] }[] = [];
    for (const [region, items] of map.entries()) {
      if (!items.length) continue;
      // Within group: dated asc → TBA → No Release; tie-break by territory alpha
      const sorted = [...items].sort((a, b) => {
        const ra = a.date ? 0 : a.tba ? 1 : 2;
        const rb = b.date ? 0 : b.tba ? 1 : 2;
        if (ra !== rb) return ra - rb;
        if (a.date && b.date) return a.date.localeCompare(b.date);
        return a.territory.localeCompare(b.territory);
      });
      result.push({ region, items: sorted });
    }
    return result;
  }, [schedule, regionOrder, regionFilter, search]);

  // ── API helpers ─────────────────────────────────────────────────────────────

  async function callImportApi(body: BodyInit, headers?: HeadersInit): Promise<boolean> {
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
      };

      let json: ApiResponse;
      try { json = (await res.json()) as ApiResponse; }
      catch { setImportError("Server returned an unreadable response"); return false; }

      if (!res.ok) { setImportError(json.message ?? "Import failed"); return false; }

      if (json.warning) {
        const WARN_MESSAGES: Record<string, string> = {
          no_rows_detected: "Couldn't detect a schedule in this PDF. Try the Paste text fallback.",
          mismatch_counts: "Territory and date counts don't match — the PDF columns may not have aligned. Try the Paste text fallback.",
        };
        setImportError(WARN_MESSAGES[json.warning] ?? "Import returned a warning. Try the Paste text fallback.");
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
    if (ok) { setPasteText(""); setPasteMode("none"); }
  }

  function handleBlocksZip() {
    setImportError(null);
    setBlocksPreview(null);
    const territories = parseBlocksTerritory(blocksA);
    const dateStrs = parseBlocksDates(blocksB);
    if (territories.length === 0 || dateStrs.length === 0) {
      setImportError("Both blocks must have at least one entry.");
      return;
    }
    if (territories.length !== dateStrs.length) {
      setImportError(`Count mismatch: ${territories.length} territories vs ${dateStrs.length} dates. Trim blank lines and retry.`);
      return;
    }
    setBlocksPreview(
      territories.map((territory, i) => {
        const { display, ...dateFields } = blockNormalizeDate(dateStrs[i]);
        return { territory, dateDisplay: display, ...dateFields };
      }),
    );
  }

  function handleBlocksSave() {
    if (!blocksPreview) return;
    onScheduleChange(
      blocksPreview.map(({ territory, date, tba, no_release }) => ({
        region: null, territory, date, tba, no_release,
      })),
    );
    setBlocksPreview(null);
    setBlocksA("");
    setBlocksB("");
    setPasteMode("none");
  }

  // ── Display helpers ─────────────────────────────────────────────────────────

  function formatDisplayDate(item: ReleaseScheduleItem): { text: string; cls: string } {
    if (item.tba) return { text: "TBA", cls: "text-amber-600" };
    if (item.no_release) return { text: "No Release", cls: "text-gray-400" };
    if (item.date) return { text: formatDateShort(item.date), cls: "text-gray-600" };
    return { text: "—", cls: "text-gray-300" };
  }

  const label = schedule.length > 0 ? `Release Dates · ${schedule.length} ▾` : "Release Dates ▾";

  // ── Popover content (rendered into a portal) ────────────────────────────────

  const popoverEl = pos ? (
    <div
      ref={popoverRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: POPOVER_W }}
      className="flex max-h-[80vh] flex-col rounded-lg border border-gray-200 bg-white shadow-elevated"
    >
      {/* ── Fixed header ──────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium tracking-wide text-gray-700">Release Dates</span>
          {schedule.length > 0 && (
            <span className="tabular-nums text-[10px] text-gray-400">{schedule.length}</span>
          )}
        </div>
        <button
          type="button"
          onClick={closePopover}
          className="text-[13px] leading-none text-gray-300 transition-colors hover:text-gray-500"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* ── Fixed search + region filter chips ────────────────────────────── */}
      <div className="flex-shrink-0 space-y-1.5 border-b border-gray-100 px-3 py-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search territory…"
          className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700 placeholder:text-gray-400 outline-none focus:border-indigo-400"
        />
        {namedRegions.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setRegionFilter(null)}
              className={`rounded px-2 py-px text-[10px] tracking-wide transition-colors ${
                regionFilter === null
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All
            </button>
            {namedRegions.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegionFilter(regionFilter === r ? null : r)}
                className={`rounded px-2 py-px text-[10px] tracking-wide transition-colors ${
                  regionFilter === r
                    ? "bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-200"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable content — list or paste panel ──────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pasteMode === "none" ? (
          schedule.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-gray-400">No schedule imported yet.</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-gray-400">No territories match.</p>
          ) : (
            groups.map(({ region, items }) => (
              <div key={region}>
                {/* Sticky region heading */}
                <div className="sticky top-0 z-[1] flex items-baseline justify-between bg-white px-3 pb-1 pt-2.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-gray-400">
                    {region}
                  </span>
                  <span className="tabular-nums text-[10px] text-gray-300">{items.length}</span>
                </div>
                {items.map((item, i) => {
                  const { text, cls } = formatDisplayDate(item);
                  return (
                    <div
                      key={`${item.region ?? "none"}|${item.territory}|${item.date ?? "null"}|${i}`}
                      className="flex items-center justify-between px-3 py-1 transition-colors hover:bg-gray-50"
                    >
                      <span className="min-w-0 flex-1 truncate pr-3 text-[11px] text-gray-700">
                        {item.territory}
                      </span>
                      <span className={`flex-shrink-0 tabular-nums text-[11px] ${cls}`}>
                        {text}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )
        ) : pasteMode === "text" ? (
          /* ── Paste text panel ────────────────────────────────────────────── */
          <div className="space-y-2 p-3">
            <textarea
              rows={7}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste raw PDF text here…"
              className="w-full resize-none rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              disabled={importing || !pasteText.trim()}
              onClick={() => void handlePaste()}
              className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {importing ? "Parsing…" : "Parse & Save"}
            </button>
          </div>
        ) : (
          /* ── Two-blocks panel ────────────────────────────────────────────── */
          <div className="space-y-2 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <p className="text-[10px] text-gray-500">Territories</p>
                <textarea
                  rows={7}
                  value={blocksA}
                  onChange={(e) => { setBlocksA(e.target.value); setBlocksPreview(null); }}
                  placeholder={"Australia\nUnited Kingdom\nFrance\n…"}
                  className="w-full resize-none rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-400"
                />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-gray-500">Dates</p>
                <textarea
                  rows={7}
                  value={blocksB}
                  onChange={(e) => { setBlocksB(e.target.value); setBlocksPreview(null); }}
                  placeholder={"1-Jan-26\nTBA\nNo Release\n…"}
                  className="w-full resize-none rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            {!blocksPreview ? (
              <button
                type="button"
                disabled={!blocksA.trim() || !blocksB.trim()}
                onClick={handleBlocksZip}
                className="rounded border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 disabled:opacity-40"
              >
                Zip &amp; Preview
              </button>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500">
                  {blocksPreview.length} rows matched{blocksPreview.length > 10 ? " · showing first 10" : ""}
                </p>
                <div className="rounded border border-gray-100 bg-gray-50">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {blocksPreview.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="max-w-[110px] truncate px-2 py-[3px] text-gray-700">{row.territory}</td>
                          <td className={`px-2 py-[3px] text-right tabular-nums ${row.tba ? "text-amber-600" : row.no_release ? "text-gray-400" : "text-gray-600"}`}>{row.dateDisplay}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={handleBlocksSave} className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500">
                    Save {blocksPreview.length} rows
                  </button>
                  <button type="button" onClick={() => setBlocksPreview(null)} className="rounded border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:text-gray-700">
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky footer — import controls always visible ────────────────── */}
      <div className="flex-shrink-0 space-y-1.5 border-t border-gray-100 bg-white px-3 py-2.5">
        {importError && (
          <p className="text-[11px] leading-snug text-red-500">{importError}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-gray-200 px-2 py-px text-[11px] text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 disabled:opacity-40"
          >
            {importing ? "Importing…" : "Import PDF"}
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => { setPasteMode(pasteMode === "text" ? "none" : "text"); setBlocksPreview(null); setImportError(null); }}
            className={`rounded border px-2 py-px text-[11px] transition-colors disabled:opacity-40 ${pasteMode === "text" ? "border-indigo-300 text-indigo-600" : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
          >
            Paste text
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => { setPasteMode(pasteMode === "blocks" ? "none" : "blocks"); setBlocksPreview(null); setImportError(null); }}
            className={`rounded border px-2 py-px text-[11px] transition-colors disabled:opacity-40 ${pasteMode === "blocks" ? "border-indigo-300 text-indigo-600" : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
          >
            Two blocks
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePopover() : openPopover())}
        className="rounded border border-gray-200 px-1.5 py-px text-[11px] text-gray-500 transition-colors duration-100 hover:border-gray-300 hover:text-gray-700"
      >
        {label}
      </button>
      {open && popoverEl !== null && typeof document !== "undefined"
        ? createPortal(popoverEl, document.body)
        : null}
    </>
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
  const [showBriefing, setShowBriefing] = useState(false);

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
    // Left accent bar via border-l; subtle bottom shadow separates snapshot from board canvas
    <div className="flex-shrink-0 border-b border-l-[3px] border-b-gray-200 border-l-indigo-400 bg-white py-2 pl-[18px] pr-5 shadow-[0_2px_6px_rgba(0,0,0,0.04)]">

      {/* ── Single header row ── */}
      <div className="flex h-6 items-center gap-2.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 transition-colors duration-100 hover:text-gray-700"
        >
          <span className="text-[7px] text-gray-300">{collapsed ? "▶" : "▼"}</span>
          <span>Snapshot</span>
        </button>

        <span className="select-none text-gray-300">·</span>

        {collapsed ? (
          /* Collapsed: concise status text — reads as a compressed control bar */
          <span className="text-[11px] tracking-wide text-gray-500">
            {summary || <span className="text-gray-300">—</span>}
          </span>
        ) : (
          /* Expanded: status chips */
          <div className="flex items-center gap-1.5">
            {blockedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-600">
                <span className="h-[5px] w-[5px] rounded-full bg-red-500" />
                {blockedCount} blocked
              </span>
            )}
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                <span className="h-[5px] w-[5px] rounded-full bg-amber-500" />
                {overdueCount} overdue
              </span>
            )}
            {blockedCount === 0 && overdueCount === 0 && (
              <span className="text-[11px] tracking-wide text-gray-400">No issues</span>
            )}
          </div>
        )}

        {/* Release Dates popover */}
        <ReleaseDatesPopover
          boardId={board.id}
          schedule={board.release_schedule}
          onScheduleChange={(rows) => void onBoardUpdate({ release_schedule: rows })}
        />

        {/* Brief + saving indicator */}
        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowBriefing((v) => !v)}
            className={`text-[11px] transition-colors ${showBriefing ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}
          >
            ✦ Brief
          </button>
          {saving && !collapsed && (
            <span className="text-[10px] tracking-wide text-gray-400">Saving…</span>
          )}
        </div>
      </div>

      {/* AI Briefing panel */}
      {showBriefing && (
        <BoardBriefingPanel boardId={board.id} onClose={() => setShowBriefing(false)} />
      )}

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
          <div className="border-t border-gray-100 pt-1.5">
            {highlightedNotes.length === 0 ? (
              <p className="text-[10px] text-gray-400">
                No pinned cards — use ☆ on a card to pin one.
              </p>
            ) : (
              <div className="flex items-start gap-1.5">
                <span className="mt-[3px] flex-shrink-0 text-[10px] uppercase tracking-[0.08em] text-gray-400">
                  Pinned
                </span>
                <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex gap-1.5 pb-0.5">
                    {highlightedNotes.map((note) => {
                      const dueLabel = timedLabelForDueDate(note.due_date);
                      return (
                        <div
                          key={note.id}
                          className="group flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1 pl-2.5 pr-1.5 shadow-card transition-all duration-150 hover:-translate-y-[1px] hover:border-gray-300 hover:shadow-card-hover"
                          onClick={() => onOpenNote(note.note_id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenNote(note.note_id); }}
                        >
                          <div className="min-w-0">
                            <p className="max-w-[180px] truncate text-[11px] text-gray-800">
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
                            className="flex-shrink-0 text-[10px] text-amber-500 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-gray-400"
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
