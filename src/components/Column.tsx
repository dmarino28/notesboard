"use client";

import { ColumnRow } from "@/lib/columns";
import { NoteRow } from "@/lib/notes";
import { NoteComposer } from "./NoteComposer";
import { NoteItem } from "./NoteItem";

type Props = {
  column: ColumnRow;
  notes: NoteRow[];
  allColumns: ColumnRow[];
  onAddNote: (content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onMoveNote: (id: string, columnId: string) => Promise<void>;
};

export function Column({
  column,
  notes,
  allColumns,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onMoveNote,
}: Props) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">{column.name}</h2>
        <span className="text-xs text-neutral-500">{notes.length}</span>
      </div>

      <NoteComposer onAdd={onAddNote} />

      {notes.length === 0 ? (
        <p className="py-4 text-center text-xs text-neutral-600">No notes</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              allColumns={allColumns}
              onDelete={onDeleteNote}
              onUpdate={onUpdateNote}
              onMove={onMoveNote}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
