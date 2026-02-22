"use client";

import { useMemo } from "react";
import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { generateMonthGrid, getNotesForDay } from "@/lib/calendar";
import { CalendarDayCell } from "./CalendarDayCell";

type Props = {
  currentMonth: Date;
  notes: NoteRow[];
  noteLabelMap: Record<string, LabelRow[]>;
  onNoteClick: (noteId: string) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

  const itemsByDay = useMemo(
    () => cells.map((date) => getNotesForDay(date, notes)),
    [cells, notes],
  );

  const hasAnyItems = useMemo(
    () => itemsByDay.some((day) => day.length > 0),
    [itemsByDay],
  );

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08]">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-white/[0.07] bg-neutral-900/50">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-600"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells or empty state */}
      {hasAnyItems ? (
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
            const isToday = date.getTime() === today.getTime();
            return (
              <CalendarDayCell
                key={date.toISOString()}
                date={date}
                items={itemsByDay[i]}
                isCurrentMonth={isCurrentMonth}
                isToday={isToday}
                noteLabelMap={noteLabelMap}
                onNoteClick={onNoteClick}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-1.5 text-center">
          <p className="text-sm font-medium text-neutral-500">No dated cards this month</p>
          <p className="text-xs text-neutral-700">
            Add due dates or start/end dates to see them here
          </p>
        </div>
      )}
    </div>
  );
}
