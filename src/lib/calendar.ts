import { supabase } from "./supabase";
import { NoteRow } from "./notes";
import { LabelRow } from "./labels";

// ------------------------------------------------------------------ types

export type CalendarFilters = {
  boardIds: string[];   // empty = all boards
  labelIds: string[];   // empty = no label filtering
  type: "both" | "events" | "due";
  timeState: {
    overdue: boolean;
    dueToday: boolean;
    dueNext7: boolean;
    happeningNow: boolean;
    startingNext7: boolean;
    pastEvents: boolean;
  };
  showArchived: boolean;
};

export const DEFAULT_FILTERS: CalendarFilters = {
  boardIds: [],
  labelIds: [],
  type: "both",
  timeState: {
    overdue: false,
    dueToday: false,
    dueNext7: false,
    happeningNow: false,
    startingNext7: false,
    pastEvents: false,
  },
  showArchived: false,
};

// ------------------------------------------------------------------ data fetching

const NOTE_SELECT =
  "id, content, column_id, board_id, position, created_at, description, due_date, event_start, event_end, archived";

/** Fetches all notes across all boards (including archived). Filter client-side. */
export async function listAllNotes(): Promise<{ data: NoteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .order("created_at", { ascending: false });

  return { data: (data ?? []) as NoteRow[], error: error?.message ?? null };
}

/** Fetches all labels across all boards. */
export async function listAllLabels(): Promise<{ data: LabelRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("labels")
    .select("id, board_id, name, color, created_at")
    .order("created_at", { ascending: true });

  return { data: (data ?? []) as LabelRow[], error: error?.message ?? null };
}

/** Builds a noteId → LabelRow[] map across all boards. */
export async function listAllNoteLabels(): Promise<{
  data: Record<string, LabelRow[]>;
  error: string | null;
}> {
  const { data: labels, error: le } = await supabase
    .from("labels")
    .select("id, board_id, name, color, created_at");

  if (le) return { data: {}, error: le.message };
  if (!labels || labels.length === 0) return { data: {}, error: null };

  const labelMap = Object.fromEntries(labels.map((l) => [l.id, l as LabelRow]));

  const { data: noteLabels, error: nle } = await supabase
    .from("note_labels")
    .select("note_id, label_id");

  if (nle) return { data: {}, error: nle.message };

  const map: Record<string, LabelRow[]> = {};
  for (const row of (noteLabels ?? []) as { note_id: string; label_id: string }[]) {
    const label = labelMap[row.label_id];
    if (label) {
      if (!map[row.note_id]) map[row.note_id] = [];
      map[row.note_id].push(label);
    }
  }

  return { data: map, error: null };
}

// ------------------------------------------------------------------ filtering

/**
 * Applies all calendar filters client-side. Filter logic:
 * - board / label / type / time categories combine as AND.
 * - Within due time-state filters: OR.
 * - Within event time-state filters: OR.
 * - If no time-state filters are active, time filtering is skipped (all pass).
 * - Label filter OR: note must have at least one of the selected labels.
 */
export function filterNotes(
  notes: NoteRow[],
  noteLabelMap: Record<string, LabelRow[]>,
  filters: CalendarFilters,
): NoteRow[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const next7End = new Date(todayStart.getTime() + 7 * 86_400_000);

  const { timeState } = filters;
  const anyDueFilter = timeState.overdue || timeState.dueToday || timeState.dueNext7;
  const anyEventFilter =
    timeState.happeningNow || timeState.startingNext7 || timeState.pastEvents;
  const anyTimeFilter = anyDueFilter || anyEventFilter;

  return notes.filter((note) => {
    // Archived
    if (!filters.showArchived && note.archived) return false;

    // Board filter (empty = include all)
    if (filters.boardIds.length > 0 && !filters.boardIds.includes(note.board_id)) return false;

    // Label filter (empty = no filtering; non-empty = OR match)
    if (filters.labelIds.length > 0) {
      const noteLabels = noteLabelMap[note.id] ?? [];
      const noteLabelIds = new Set(noteLabels.map((l) => l.id));
      if (!filters.labelIds.some((id) => noteLabelIds.has(id))) return false;
    }

    // Type filter
    const isEvent = Boolean(note.event_start);
    const isDue = Boolean(note.due_date) && !isEvent;
    if (filters.type === "events" && !isEvent) return false;
    if (filters.type === "due" && !isDue) return false;

    // Time-state filter (only applied when at least one toggle is enabled)
    if (anyTimeFilter) {
      let passes = false;

      if (anyDueFilter && note.due_date) {
        const due = new Date(note.due_date);
        if (timeState.overdue && due < now) passes = true;
        if (timeState.dueToday && due >= todayStart && due < todayEnd) passes = true;
        if (timeState.dueNext7 && due >= now && due < next7End) passes = true;
      }

      if (anyEventFilter && note.event_start) {
        const start = new Date(note.event_start);
        const end = note.event_end ? new Date(note.event_end) : null;
        if (timeState.happeningNow && start <= now && (end === null || now <= end))
          passes = true;
        if (timeState.startingNext7 && start >= now && start < next7End) passes = true;
        if (timeState.pastEvents && (end ? end < now : start < now)) passes = true;
      }

      if (!passes) return false;
    }

    return true;
  });
}

// ------------------------------------------------------------------ calendar helpers

export type DayItem = { note: NoteRow; type: "event" | "due" };

/**
 * Returns calendar items (events + due-date notes) that fall on a given day.
 * Events span all days in [event_start_day … event_end_day].
 * Due-date items appear only on their exact day.
 */
export function getNotesForDay(date: Date, notes: NoteRow[]): DayItem[] {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const items: DayItem[] = [];

  for (const note of notes) {
    if (note.event_start) {
      const evStart = new Date(note.event_start);
      const evEnd = note.event_end ? new Date(note.event_end) : evStart;
      const evStartDay = new Date(evStart.getFullYear(), evStart.getMonth(), evStart.getDate());
      const evEndDay = new Date(evEnd.getFullYear(), evEnd.getMonth(), evEnd.getDate());
      if (dayStart >= evStartDay && dayStart <= evEndDay) {
        items.push({ note, type: "event" });
      }
    } else if (note.due_date) {
      const due = new Date(note.due_date);
      const dueDayStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      if (dayStart.getTime() === dueDayStart.getTime()) {
        items.push({ note, type: "due" });
      }
    }
  }

  return items;
}

/** Notes with neither event_start nor due_date. */
export function getUnscheduledNotes(notes: NoteRow[]): NoteRow[] {
  return notes.filter((n) => !n.event_start && !n.due_date);
}

/**
 * Generates a 42-cell (6-row × 7-col) array of dates for the month grid.
 * Cells before the 1st and after the last day of the month come from
 * adjacent months to fill complete weeks (Sunday-first).
 */
export function generateMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Date[] = [];

  for (let i = startOffset; i > 0; i--) {
    cells.push(new Date(year, month, 1 - i));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push(new Date(year, month + 1, nextDay++));
  }

  return cells;
}
