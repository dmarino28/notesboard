"use client";

import { useMemo } from "react";
import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { generateMonthGrid, getNotesForDay } from "@/lib/calendar";
import { CalendarDayCell } from "./CalendarDayCell";

// Height constants shared with CalendarDayCell
export const BAR_H     = 20; // px per multi-day bar lane (bar + gap)
export const DAY_NUM_H = 28; // px for the day-number row at the top of each cell

type Props = {
  currentMonth: Date;
  notes: NoteRow[];
  noteLabelMap: Record<string, LabelRow[]>;
  onNoteClick: (noteId: string) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Multi-day bar types ────────────────────────────────────────────────────

type WeekBar = {
  note: NoteRow;
  colStart: number;       // 0–6: leftmost column in THIS week
  colEnd: number;         // 0–6: rightmost column in THIS week (inclusive)
  isActualStart: boolean; // true if the event actually starts in this week
  isActualEnd: boolean;   // true if the event actually ends in this week
  lane: number;           // vertical stacking slot (0 = topmost)
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function dayMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** True only when event_start and event_end span at least two distinct calendar days. */
function isMultiDayEvent(note: NoteRow): boolean {
  if (!note.event_start || !note.event_end) return false;
  return dayMidnight(new Date(note.event_start)) < dayMidnight(new Date(note.event_end));
}

/**
 * For one week (7 consecutive dates), compute bar segments for every
 * multi-day event that overlaps, then greedily assign vertical lanes so
 * bars never overlap.
 */
function buildWeekBars(
  weekDays: Date[],
  multiDayNotes: NoteRow[],
): { bars: WeekBar[]; lanesByDay: number[] } {
  const weekStartMs = dayMidnight(weekDays[0]);
  const weekEndMs   = dayMidnight(weekDays[6]);

  // Collect segments that touch this week
  const segs: Omit<WeekBar, "lane">[] = [];
  for (const note of multiDayNotes) {
    const evStartMs = dayMidnight(new Date(note.event_start!));
    const evEndMs   = dayMidnight(new Date(note.event_end!));

    if (evEndMs < weekStartMs || evStartMs > weekEndMs) continue;

    const colStart = Math.max(0, Math.round((evStartMs - weekStartMs) / 86_400_000));
    const colEnd   = Math.min(6, Math.round((evEndMs   - weekStartMs) / 86_400_000));

    segs.push({
      note,
      colStart,
      colEnd,
      isActualStart: evStartMs >= weekStartMs,
      isActualEnd:   evEndMs   <= weekEndMs,
    });
  }

  // Sort: earliest start first, then longest span first
  segs.sort((a, b) =>
    a.colStart !== b.colStart
      ? a.colStart - b.colStart
      : (b.colEnd - b.colStart) - (a.colEnd - a.colStart),
  );

  // Greedy lane assignment: put each bar in the first lane that doesn't conflict
  const laneEndCols: number[] = []; // laneEndCols[lane] = rightmost colEnd claimed so far
  const bars: WeekBar[] = segs.map((seg) => {
    let lane = laneEndCols.findIndex((end) => end < seg.colStart);
    if (lane === -1) lane = laneEndCols.length;
    laneEndCols[lane] = seg.colEnd;
    return { ...seg, lane };
  });

  // How many lanes does each column need to reserve?
  const lanesByDay = new Array(7).fill(0) as number[];
  for (const bar of bars) {
    for (let col = bar.colStart; col <= bar.colEnd; col++) {
      lanesByDay[col] = Math.max(lanesByDay[col], bar.lane + 1);
    }
  }

  return { bars, lanesByDay };
}

// ─── Multi-day bar component ─────────────────────────────────────────────────

function MultiDayEventBar({
  bar,
  labels,
  onNoteClick,
}: {
  bar: WeekBar;
  labels: LabelRow[];
  onNoteClick: (id: string) => void;
}) {
  const dotColor = labels[0]?.color;
  // Show text on the first visible segment of this event in the visible grid
  const showLabel = bar.isActualStart || bar.colStart === 0;

  const leftPct  = (bar.colStart / 7) * 100;
  const widthPct = ((bar.colEnd - bar.colStart + 1) / 7) * 100;

  // Inset 3 px at each capped edge so the bar doesn't bleed into cell borders
  const insetL = bar.isActualStart ? 3 : 0;
  const insetR = bar.isActualEnd   ? 3 : 0;

  const topPx    = DAY_NUM_H + bar.lane * BAR_H;
  const barHeightPx = BAR_H - 2; // 2 px gap between lanes

  return (
    <button
      type="button"
      title={bar.note.content}
      style={{
        position: "absolute",
        top: topPx,
        left:  `calc(${leftPct}%  + ${insetL}px)`,
        width: `calc(${widthPct}% - ${insetL + insetR}px)`,
        height: barHeightPx,
      }}
      className={[
        // Base
        "pointer-events-auto flex items-center overflow-hidden whitespace-nowrap",
        "bg-indigo-500 text-white text-[11px] leading-none font-medium",
        "transition-colors duration-100 hover:bg-indigo-600 active:bg-indigo-700",
        // Left edge
        bar.isActualStart ? "rounded-l-md pl-1.5" : "pl-0.5",
        // Right edge
        bar.isActualEnd   ? "rounded-r-md pr-1.5" : "pr-0.5",
        // Continuation indicators (no-radius edge gets a subtle shade instead)
        !bar.isActualStart ? "border-l border-indigo-400/40" : "",
        !bar.isActualEnd   ? "border-r border-indigo-400/40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onNoteClick(bar.note.id)}
    >
      {showLabel && (
        <>
          {dotColor && (
            <span
              className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/30"
              style={{ backgroundColor: dotColor }}
            />
          )}
          <span className="truncate">{bar.note.content}</span>
        </>
      )}
    </button>
  );
}

// ─── Main grid ───────────────────────────────────────────────────────────────

export function CalendarMonthGrid({
  currentMonth,
  notes,
  noteLabelMap,
  onNoteClick,
}: Props) {
  const cells = useMemo(
    () => generateMonthGrid(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth],
  );

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // Split notes: multi-day events go to the overlay; everything else to cells
  const { multiDayNotes, singleDayNotes } = useMemo(() => ({
    multiDayNotes:  notes.filter(isMultiDayEvent),
    singleDayNotes: notes.filter((n) => !isMultiDayEvent(n)),
  }), [notes]);

  // Chunk the 42 cells into 6 week rows
  const weeks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, wi) => {
        const weekDays = cells.slice(wi * 7, wi * 7 + 7);
        const { bars, lanesByDay } = buildWeekBars(weekDays, multiDayNotes);
        const singleDayItems = weekDays.map((date) => getNotesForDay(date, singleDayNotes));
        return { weekDays, bars, lanesByDay, singleDayItems };
      }),
    [cells, multiDayNotes, singleDayNotes],
  );

  const hasAnyItems = useMemo(
    () =>
      multiDayNotes.length > 0 ||
      weeks.some((w) => w.singleDayItems.some((items) => items.length > 0)),
    [multiDayNotes, weeks],
  );

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 shadow-sm">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400"
          >
            {day}
          </div>
        ))}
      </div>

      {hasAnyItems ? (
        <div className="bg-white">
          {weeks.map(({ weekDays, bars, lanesByDay, singleDayItems }, wi) => (
            <div key={wi} className="relative grid grid-cols-7">
              {/* Day cells — single-day items only */}
              {weekDays.map((date, col) => (
                <CalendarDayCell
                  key={date.toISOString()}
                  date={date}
                  items={singleDayItems[col]}
                  reservedLanes={lanesByDay[col]}
                  isCurrentMonth={date.getMonth() === currentMonth.getMonth()}
                  isToday={date.getTime() === today.getTime()}
                  noteLabelMap={noteLabelMap}
                  onNoteClick={onNoteClick}
                />
              ))}

              {/* Multi-day bar overlay — pointer-events-none on container so
                  cells beneath remain clickable; individual bars re-enable them */}
              {bars.length > 0 && (
                <div className="pointer-events-none absolute inset-0 z-10">
                  {bars.map((bar) => (
                    <MultiDayEventBar
                      key={`${bar.note.id}-w${wi}`}
                      bar={bar}
                      labels={noteLabelMap[bar.note.id] ?? []}
                      onNoteClick={onNoteClick}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-1.5 bg-white text-center">
          <p className="text-sm font-medium text-gray-400">No dated cards this month</p>
          <p className="text-xs text-gray-300">
            Add due dates or start/end dates to see them here
          </p>
        </div>
      )}
    </div>
  );
}
