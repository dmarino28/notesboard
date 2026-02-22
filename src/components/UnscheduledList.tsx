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
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">
          Unscheduled
        </h3>
        <span className="min-w-[1.25rem] rounded bg-white/[0.06] px-1 text-center text-[11px] font-medium text-neutral-600">
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
              className="rounded-xl border border-white/[0.07] bg-neutral-900/70 p-3 text-left transition-all duration-150 hover:border-white/[0.14] hover:bg-neutral-800/70"
            >
              <p className="truncate text-sm text-neutral-200">{note.content}</p>
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
                  <span className="shrink-0 text-[11px] text-neutral-600">{board.name}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
