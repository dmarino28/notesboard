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

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-neutral-800">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-neutral-800 bg-neutral-900">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-neutral-500">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
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
    </div>
  );
}
