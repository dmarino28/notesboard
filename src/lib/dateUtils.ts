// Shared date helpers used by NoteItem, ActionsBoard, and awareness logic.

// ── Internal helpers ──────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function upcomingFriday(from: Date): string {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun … 5=Fri
  if (day === 5) return fmtDate(d);
  const daysUntil = (5 - day + 7) % 7;
  d.setDate(d.getDate() + daysUntil);
  return fmtDate(d);
}

// ── Timed bucket ──────────────────────────────────────────────────────────────

export type TimedBucketKey = "overdue" | "today" | "tomorrow" | "this_week" | "later";

export type TimedLabelInfo = {
  key: TimedBucketKey;
  label: string;
  /** Tailwind classes for the pill badge */
  badgeClass: string;
};

const TIMED_LABEL_INFO: Record<TimedBucketKey, TimedLabelInfo> = {
  overdue:   { key: "overdue",   label: "Overdue",   badgeClass: "bg-red-50 text-red-600" },
  today:     { key: "today",     label: "Today",     badgeClass: "bg-amber-50 text-amber-700" },
  tomorrow:  { key: "tomorrow",  label: "Tomorrow",  badgeClass: "bg-orange-50 text-orange-600" },
  this_week: { key: "this_week", label: "This Week", badgeClass: "bg-sky-50 text-sky-600" },
  later:     { key: "later",     label: "Later",     badgeClass: "bg-neutral-100 text-neutral-500" },
};

/**
 * Derives the display bucket key from a card's effective due date.
 * Matches ActionsBoard bucketing semantics exactly (calendar-day comparisons, no time component).
 */
export function bucketKeyForDueDate(
  dueAt: string | null,
  today: Date,
): TimedBucketKey {
  if (!dueAt) return "later";
  const datePart = dueAt.split("T")[0];
  const parts = datePart.split("-").map(Number);
  if (parts.length !== 3) return "later";
  const due = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(due.getTime())) return "later";

  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);

  if (due < startOfToday) return "overdue";

  const dueStr = fmtDate(due);
  const todayStr = fmtDate(startOfToday);
  const tomorrowDate = new Date(startOfToday);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = fmtDate(tomorrowDate);

  if (dueStr === todayStr) return "today";
  if (dueStr === tomorrowStr) return "tomorrow";

  const fridayStr = upcomingFriday(startOfToday);
  if (dueStr <= fridayStr) return "this_week";

  return "later";
}

/**
 * Returns the timed label info for a due date string, or null if no due date.
 */
export function timedLabelForDueDate(dueAt: string | null): TimedLabelInfo | null {
  if (!dueAt) return null;
  const key = bucketKeyForDueDate(dueAt, new Date());
  return TIMED_LABEL_INFO[key];
}

// ── Relative time ─────────────────────────────────────────────────────────────

export function relativeTimeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function isWithin24h(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}
