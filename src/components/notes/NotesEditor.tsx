"use client";

import { useCallback, useRef } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import { NoteEntryRow } from "./NoteEntryRow";
import { viewByDay } from "@/lib/noteViews";

type Props = {
  entries: NoteEntryWithSignals[];
  boards: BoardRow[];
  focusedId: string | null;
  selectedIds: Set<string>;
  onFocus: (id: string) => void;
  onBlur: (id: string, content: string) => void;
  onChange: (id: string, content: string) => void;
  onEnter: (id: string, cursorPos: number) => void;
  onBackspace: (id: string, isEmpty: boolean) => void;
  onIndent: (id: string, direction: "in" | "out") => void;
  onArrow: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
  onAddFirstEntry: () => void;
};

export function NotesEditor({
  entries,
  boards,
  focusedId,
  selectedIds,
  onFocus,
  onBlur,
  onChange,
  onEnter,
  onBackspace,
  onIndent,
  onArrow,
  onSelect,
  onAddFirstEntry,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const dayGroups = viewByDay(entries);

  const handleArrow = useCallback(
    (id: string, direction: "up" | "down") => {
      onArrow(id, direction);
    },
    [onArrow]
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mb-1 text-sm font-medium text-gray-500">Start capturing</p>
        <p className="mb-6 text-xs text-gray-400">Type notes, bullets, campaign signals, meeting notes...</p>
        <button
          type="button"
          onClick={onAddFirstEntry}
          className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          + New note entry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {dayGroups.map((group) => {
        const isToday = group.date === today;

        return (
          <div key={group.date}>
            {/* Date section header */}
            <div className="mb-1.5 flex items-center gap-2">
              <span className={`text-xs font-semibold ${isToday ? "text-indigo-600" : "text-gray-400"}`}>
                {group.label}
              </span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>

            {/* Entries for this day */}
            <div className="space-y-0">
              {group.entries.map((entry) => (
                <NoteEntryRow
                  key={entry.id}
                  entry={entry}
                  boards={boards}
                  isFocused={focusedId === entry.id}
                  isSelected={selectedIds.has(entry.id)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  onChange={onChange}
                  onEnter={onEnter}
                  onBackspace={onBackspace}
                  onIndent={onIndent}
                  onArrow={handleArrow}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
