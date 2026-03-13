/**
 * noteViews.ts
 *
 * Pure client-side grouping and filtering utilities for the Notes workspace.
 * All views derive from the same fetched entry dataset — no separate queries.
 */

import type { NoteEntryWithSignals } from "./noteEntries";
import type { BoardRow } from "./boards";

export type ViewMode = "all" | "film" | "daily" | "market" | "signals";

// ─── View: All Notes ─────────────────────────────────────────────────────────

/** Return entries sorted by date desc, then position asc. */
export function viewAllEntries(entries: NoteEntryWithSignals[]): NoteEntryWithSignals[] {
  return [...entries].sort((a, b) => {
    const dateDiff = b.entry_date.localeCompare(a.entry_date);
    if (dateDiff !== 0) return dateDiff;
    return a.position - b.position;
  });
}

// ─── View: Film / Board ──────────────────────────────────────────────────────

export interface FilmGroup {
  boardId: string | null;
  boardName: string;
  entries: NoteEntryWithSignals[];
}

/** Group entries by their resolved board (explicit > inferred > unknown). */
export function viewByFilm(
  entries: NoteEntryWithSignals[],
  boards: BoardRow[]
): FilmGroup[] {
  const boardMap = new Map<string, BoardRow>(boards.map((b) => [b.id, b]));
  const grouped = new Map<string | null, NoteEntryWithSignals[]>();

  for (const entry of entries) {
    const boardId = entry.explicit_board_id ?? entry.inferred_board_id ?? null;
    const existing = grouped.get(boardId) ?? [];
    existing.push(entry);
    grouped.set(boardId, existing);
  }

  const result: FilmGroup[] = [];

  // Known boards first (sorted by board name), then unknown
  for (const [boardId, ents] of grouped.entries()) {
    if (boardId === null) continue;
    const board = boardMap.get(boardId);
    result.push({
      boardId,
      boardName: board?.name ?? "Unknown Board",
      entries: ents.sort((a, b) => {
        const dateDiff = b.entry_date.localeCompare(a.entry_date);
        if (dateDiff !== 0) return dateDiff;
        return a.position - b.position;
      }),
    });
  }

  result.sort((a, b) => a.boardName.localeCompare(b.boardName));

  // Unknown context at the end
  const unknown = grouped.get(null);
  if (unknown && unknown.length > 0) {
    result.push({
      boardId: null,
      boardName: "Unknown Board",
      entries: unknown.sort((a, b) => {
        const dateDiff = b.entry_date.localeCompare(a.entry_date);
        if (dateDiff !== 0) return dateDiff;
        return a.position - b.position;
      }),
    });
  }

  return result;
}

// ─── View: Daily Notes ───────────────────────────────────────────────────────

export interface DayGroup {
  date: string; // ISO date YYYY-MM-DD
  label: string;
  entries: NoteEntryWithSignals[];
}

/** Group entries by entry_date, with friendly labels for today/yesterday. */
export function viewByDay(entries: NoteEntryWithSignals[]): DayGroup[] {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const grouped = new Map<string, NoteEntryWithSignals[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.entry_date) ?? [];
    existing.push(entry);
    grouped.set(entry.entry_date, existing);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a)) // newest date first
    .map(([date, ents]) => ({
      date,
      label: date === todayStr ? "Today" : date === yesterdayStr ? "Yesterday" : formatDateLabel(date),
      entries: ents.sort((a, b) => a.position - b.position),
    }));
}

function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── View: Market ────────────────────────────────────────────────────────────

export interface MarketGroup {
  market: string;
  entries: NoteEntryWithSignals[];
}

/** Group entries by detected market signals. An entry can appear in multiple groups. */
export function viewByMarket(entries: NoteEntryWithSignals[]): MarketGroup[] {
  const grouped = new Map<string, NoteEntryWithSignals[]>();

  for (const entry of entries) {
    const markets = entry.signals.filter((s) => s.signal_type === "market");
    for (const sig of markets) {
      const existing = grouped.get(sig.signal_value) ?? [];
      if (!existing.includes(entry)) existing.push(entry);
      grouped.set(sig.signal_value, existing);
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([market, ents]) => ({
      market,
      entries: ents.sort((a, b) => {
        const dateDiff = b.entry_date.localeCompare(a.entry_date);
        if (dateDiff !== 0) return dateDiff;
        return a.position - b.position;
      }),
    }));
}

// ─── View: Campaign Signals ──────────────────────────────────────────────────

export interface SignalGroup {
  signalType: "milestone" | "channel" | "market" | "date";
  label: string;
  entries: NoteEntryWithSignals[];
}

/** Return entries that have any notable signal (milestone, channel, market, date). */
export function viewByCampaignSignals(entries: NoteEntryWithSignals[]): NoteEntryWithSignals[] {
  const NOTABLE_TYPES = new Set(["milestone", "channel", "market", "date"]);
  return [...entries]
    .filter((e) => e.signals.some((s) => NOTABLE_TYPES.has(s.signal_type)))
    .sort((a, b) => {
      const dateDiff = b.entry_date.localeCompare(a.entry_date);
      if (dateDiff !== 0) return dateDiff;
      return a.position - b.position;
    });
}

// ─── Search / Filter ─────────────────────────────────────────────────────────

/** Simple client-side text filter. */
export function filterEntriesByQuery(
  entries: NoteEntryWithSignals[],
  query: string
): NoteEntryWithSignals[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.content.toLowerCase().includes(q));
}
