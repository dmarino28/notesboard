"use client";

import { useMemo, useState } from "react";
import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { BoardRow } from "@/lib/boards";

// ------------------------------------------------------------------ types

type Props = {
  days: Date[];
  rangeStart: Date;
  rangeEnd: Date;
  notes: NoteRow[];
  noteLabelMap: Record<string, LabelRow[]>;
  boardMap: Record<string, BoardRow>;
  onNoteClick: (id: string) => void;
};

type BoardGroup = { board: BoardRow; notes: NoteRow[] };

type BarInfo =
  | { type: "event"; leftPct: number; widthPct: number }
  | { type: "due"; centerPct: number };

// ------------------------------------------------------------------ helpers

const NOTE_COL_W = 192; // px — matches w-48

function startOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Date → x-position math:
 *   leftPct  = (clampedStartMs - rangeStartMs) / totalMs * 100
 *   widthPct = (clampedEndMs   - clampedStartMs) / totalMs * 100
 *
 * For events we work in day boundaries (midnight-to-midnight).
 * For due dates we place a point marker at the midday of the due-date column.
 * The today line likewise sits at midday of today's column.
 */
function computeBar(note: NoteRow, rangeStartMs: number, rangeEndMs: number): BarInfo | null {
  const totalMs = rangeEndMs - rangeStartMs;

  if (note.event_start) {
    const evStart = new Date(note.event_start);
    const evEnd = note.event_end ? new Date(note.event_end) : evStart;

    const evStartMs = startOfDayMs(evStart);
    const evEndMs = startOfDayMs(evEnd) + 86_400_000; // exclusive

    if (evEndMs <= rangeStartMs || evStartMs >= rangeEndMs) return null;

    const clampedStart = Math.max(evStartMs, rangeStartMs);
    const clampedEnd = Math.min(evEndMs, rangeEndMs);

    return {
      type: "event",
      leftPct: ((clampedStart - rangeStartMs) / totalMs) * 100,
      widthPct: ((clampedEnd - clampedStart) / totalMs) * 100,
    };
  }

  if (note.due_date) {
    const dueDayMs = startOfDayMs(new Date(note.due_date));
    const dueDayEndMs = dueDayMs + 86_400_000;

    if (dueDayMs >= rangeEndMs || dueDayEndMs <= rangeStartMs) return null;

    const centerMs = dueDayMs + 86_400_000 / 2;
    return { type: "due", centerPct: ((centerMs - rangeStartMs) / totalMs) * 100 };
  }

  return null;
}

function formatDayLabel(date: Date, numDays: number): string {
  if (numDays <= 7) {
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  if (date.getDate() === 1) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return String(date.getDate());
}

function formatTooltip(note: NoteRow): string {
  const lines: string[] = [note.content.slice(0, 80)];
  if (note.event_start) {
    const startStr = new Date(note.event_start).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const endStr = note.event_end
      ? new Date(note.event_end).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
    lines.push(endStr ? `${startStr} – ${endStr}` : `Event: ${startStr}`);
  }
  if (note.due_date) {
    lines.push(
      `Due: ${new Date(note.due_date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`,
    );
  }
  return lines.join("\n");
}

// ------------------------------------------------------------------ sub-components

function EventBar({
  note,
  bar,
  onNoteClick,
}: {
  note: NoteRow;
  bar: Extract<BarInfo, { type: "event" }>;
  onNoteClick: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const tooltip = formatTooltip(note);
  const wide = bar.widthPct > 6;

  return (
    <div
      className="absolute inset-y-[18%] z-[2] cursor-pointer rounded-sm bg-indigo-600 ring-1 ring-indigo-500/50 transition-colors hover:bg-indigo-500"
      style={{ left: `${bar.leftPct}%`, width: `${Math.max(bar.widthPct, 0.4)}%` }}
      onClick={() => onNoteClick(note.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {wide && (
        <span className="absolute inset-0 flex items-center overflow-hidden px-1.5 text-[10px] leading-none text-white/90 select-none">
          {note.content}
        </span>
      )}
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 max-w-xs whitespace-pre-wrap rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-100 shadow-xl ring-1 ring-neutral-700">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function DueMarker({
  note,
  bar,
  onNoteClick,
}: {
  note: NoteRow;
  bar: Extract<BarInfo, { type: "due" }>;
  onNoteClick: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const tooltip = formatTooltip(note);

  return (
    <div
      className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      style={{ left: `${bar.centerPct}%` }}
      onClick={() => onNoteClick(note.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-3 w-3 rounded-full border-2 border-amber-400 bg-amber-900/70 transition-colors hover:bg-amber-700/80" />
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 max-w-xs whitespace-pre-wrap rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-100 shadow-xl ring-1 ring-neutral-700">
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ main

export function TimelineGrid({
  days,
  rangeStart,
  rangeEnd,
  notes,
  noteLabelMap,
  boardMap,
  onNoteClick,
}: Props) {
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const numDays = days.length;

  const today = new Date();
  const todayPct =
    ((startOfDayMs(today) + 86_400_000 / 2 - rangeStartMs) / (rangeEndMs - rangeStartMs)) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  const groups = useMemo((): BoardGroup[] => {
    const map: Record<string, BoardGroup> = {};
    for (const note of notes) {
      const bar = computeBar(note, rangeStartMs, rangeEndMs);
      if (!bar) continue;
      const board = boardMap[note.board_id];
      if (!board) continue;
      if (!map[note.board_id]) map[note.board_id] = { board, notes: [] };
      map[note.board_id].notes.push(note);
    }
    return Object.values(map).sort((a, b) => a.board.name.localeCompare(b.board.name));
  }, [notes, boardMap, rangeStartMs, rangeEndMs]);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 text-sm">
      {/* ── Sticky axis header ── */}
      <div className="sticky top-0 z-10 flex border-b border-neutral-700 bg-neutral-900">
        {/* Label column */}
        <div
          className="shrink-0 border-r border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-500"
          style={{ width: NOTE_COL_W }}
        >
          Note
        </div>

        {/* Day cells */}
        <div className="relative min-w-0 flex-1">
          <div
            className="grid h-full divide-x divide-neutral-800"
            style={{ gridTemplateColumns: `repeat(${numDays}, 1fr)` }}
          >
            {days.map((d) => {
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div
                  key={d.toISOString()}
                  className={`py-2 text-center text-[10px] leading-tight ${
                    isToday ? "font-semibold text-blue-400" : "text-neutral-500"
                  }`}
                >
                  {formatDayLabel(d, numDays)}
                </div>
              );
            })}
          </div>
          {/* Today tick in header */}
          {showToday && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-blue-500/70"
              style={{ left: `${todayPct}%` }}
            />
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="bg-neutral-950">
        {groups.length === 0 && (
          <div className="flex items-center justify-center py-20 text-sm text-neutral-500">
            No items visible in this range
          </div>
        )}

        {groups.map(({ board, notes: boardNotes }) => (
          <div key={board.id}>
            {/* Board header */}
            <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5">
              <span className="text-xs font-semibold text-neutral-300">{board.name}</span>
              <span className="text-xs text-neutral-600">({boardNotes.length})</span>
            </div>

            {/* Note rows */}
            {boardNotes.map((note) => {
              const bar = computeBar(note, rangeStartMs, rangeEndMs);
              if (!bar) return null;
              const noteLabels = noteLabelMap[note.id] ?? [];

              return (
                <div
                  key={note.id}
                  className="flex min-h-[30px] border-b border-neutral-800/50 hover:bg-neutral-900/30"
                >
                  {/* Title column */}
                  <div
                    className="shrink-0 border-r border-neutral-800 px-2 py-1"
                    style={{ width: NOTE_COL_W }}
                  >
                    <button
                      className="flex w-full items-center gap-1 text-left"
                      onClick={() => onNoteClick(note.id)}
                      title={note.content}
                    >
                      {noteLabels.slice(0, 4).map((l) => (
                        <span
                          key={l.id}
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: l.color }}
                        />
                      ))}
                      <span className="truncate text-xs text-neutral-300 hover:text-neutral-100">
                        {note.content}
                      </span>
                    </button>
                  </div>

                  {/* Bar area */}
                  <div className="relative min-w-0 flex-1 self-stretch">
                    {/* Day gridlines */}
                    {days.map((_, i) =>
                      i === 0 ? null : (
                        <div
                          key={i}
                          className="pointer-events-none absolute inset-y-0 w-px bg-neutral-800/60"
                          style={{ left: `${(i / numDays) * 100}%` }}
                        />
                      ),
                    )}

                    {/* Today line */}
                    {showToday && (
                      <div
                        className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-500/25"
                        style={{ left: `${todayPct}%` }}
                      />
                    )}

                    {bar.type === "event" && (
                      <EventBar note={note} bar={bar} onNoteClick={onNoteClick} />
                    )}
                    {bar.type === "due" && (
                      <DueMarker note={note} bar={bar} onNoteClick={onNoteClick} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
