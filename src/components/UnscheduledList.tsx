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
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Unscheduled
        </h3>
        <span className="min-w-[1.25rem] rounded bg-gray-100 px-1 text-center text-[11px] font-medium text-gray-500">
          {notes.length}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {notes.map((note) => {
          const labels = noteLabelMap[note.id] ?? [];
          const board = boardMap[note.board_id];
          return (
            <button
              key={note.id}
              onClick={() => onNoteClick(note.id)}
              className="rounded-xl border border-gray-200 bg-white p-3 text-left shadow-card transition-all duration-150 hover:border-gray-300 hover:shadow-card-hover"
            >
              <p className="truncate text-sm text-gray-800">{note.content}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {labels.slice(0, 4).map((label) => (
                    <span
                      key={label.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: label.color }}
                      title={label.name}
                    />
                  ))}
                </div>
                {board && (
                  <span className="shrink-0 text-[11px] text-gray-400">{board.name}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
