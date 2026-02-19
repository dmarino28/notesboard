"use client";

import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { BoardRow } from "@/lib/boards";

type Props = {
  notes: NoteRow[];
  boardMap: Record<string, BoardRow>;
  noteLabelMap: Record<string, LabelRow[]>;
  onNoteClick: (noteId: string) => void;
};

export function UnscheduledList({ notes, boardMap, noteLabelMap, onNoteClick }: Props) {
  if (notes.length === 0) return null;

  return (
    <div className="mt-2 pb-8">
      <h3 className="mb-2 text-sm font-medium text-neutral-400">
        Unscheduled ({notes.length})
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {notes.map((note) => {
          const labels = noteLabelMap[note.id] ?? [];
          const board = boardMap[note.board_id];
          return (
            <button
              key={note.id}
              onClick={() => onNoteClick(note.id)}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-left transition-colors hover:border-neutral-700"
            >
              <p className="truncate text-sm text-neutral-200">{note.content}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {labels.slice(0, 4).map((label) => (
                    <span
                      key={label.id}
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: label.color }}
                      title={label.name}
                    />
                  ))}
                </div>
                {board && <span className="shrink-0 text-xs text-neutral-600">{board.name}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
