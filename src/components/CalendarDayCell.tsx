"use client";

import { useState } from "react";
import { DayItem } from "@/lib/calendar";
import { LabelRow } from "@/lib/labels";

type Props = {
  date: Date;
  items: DayItem[];
  isCurrentMonth: boolean;
  isToday: boolean;
  noteLabelMap: Record<string, LabelRow[]>;
  onNoteClick: (noteId: string) => void;
};

const MAX_VISIBLE = 3;

export function CalendarDayCell({
  date,
  items,
  isCurrentMonth,
  isToday,
  noteLabelMap,
  onNoteClick,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded || items.length <= MAX_VISIBLE ? items : items.slice(0, MAX_VISIBLE);
  const overflow = items.length - MAX_VISIBLE;
  const now = new Date();

  return (
    <div
      className={`min-h-[96px] border-b border-r border-neutral-800 p-1 ${
        isCurrentMonth ? "bg-neutral-950" : "bg-neutral-900/30"
      }`}
    >
      {/* Day number */}
      <div className="mb-1 flex justify-end pr-0.5">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
            isToday
              ? "bg-white text-neutral-950"
              : isCurrentMonth
                ? "text-neutral-300"
                : "text-neutral-600"
          }`}
        >
          {date.getDate()}
        </span>
      </div>

      {/* Calendar items */}
      <div className="space-y-0.5">
        {visible.map(({ note, type }) => {
          const labels = noteLabelMap[note.id] ?? [];
          const isOverdue =
            type === "due" && note.due_date !== null && new Date(note.due_date) < now;

          return (
            <button
              key={`${note.id}-${type}`}
              onClick={() => onNoteClick(note.id)}
              title={note.content}
              className={`w-full truncate rounded px-1 py-px text-left text-xs leading-4 transition-opacity hover:opacity-75 ${
                type === "event"
                  ? "bg-indigo-900/70 text-indigo-200"
                  : isOverdue
                    ? "bg-red-900/70 text-red-200"
                    : "bg-amber-900/60 text-amber-200"
              }`}
            >
              {labels.length > 0 && (
                <span
                  className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: labels[0].color }}
                />
              )}
              {note.content}
            </button>
          );
        })}

        {!expanded && overflow > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full text-left text-xs text-neutral-500 hover:text-neutral-300"
          >
            +{overflow} more
          </button>
        )}
        {expanded && overflow > 0 && (
          <button
            onClick={() => setExpanded(false)}
            className="w-full text-left text-xs text-neutral-500 hover:text-neutral-300"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}
