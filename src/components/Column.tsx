"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { ColumnRow } from "@/lib/columns";
import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { NoteComposer } from "./NoteComposer";
import { NoteItem } from "./NoteItem";

type Props = {
  column: ColumnRow;
  notes: NoteRow[];
  allColumns: ColumnRow[];
  noteLabelMap: Record<string, LabelRow[]>;
  onAddNote: (content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onMoveNote: (id: string, columnId: string) => Promise<void>;
  onOpenNote: (noteId: string) => void;
  dragHandleListeners?: DraggableSyntheticListeners;
  dragHandleAttributes?: DraggableAttributes;
};

export function Column({
  column,
  notes,
  allColumns,
  noteLabelMap,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onMoveNote,
  onOpenNote,
  dragHandleListeners,
  dragHandleAttributes,
}: Props) {
  const noteIds = notes.map((n) => n.id);

  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="flex items-center gap-2">
        <button
          className="cursor-grab touch-none text-neutral-600 hover:text-neutral-400 active:cursor-grabbing"
          aria-label="Drag to reorder column"
          {...dragHandleListeners}
          {...dragHandleAttributes}
        >
          <GrabIcon />
        </button>
        {column.color && (
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: column.color }}
          />
        )}
        <h2 className="flex-1 text-sm font-semibold text-neutral-200">{column.name}</h2>
        <span className="text-xs text-neutral-500">{notes.length}</span>
      </div>

      <NoteComposer onAdd={onAddNote} />

      <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
        <ul className="min-h-8 space-y-2 rounded">
          {notes.length === 0 ? (
            <li className="py-4 text-center text-xs text-neutral-600">No notes</li>
          ) : (
            notes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                allColumns={allColumns}
                noteLabels={noteLabelMap[note.id] ?? []}
                onDelete={onDeleteNote}
                onUpdate={onUpdateNote}
                onMove={onMoveNote}
                onOpen={() => onOpenNote(note.id)}
              />
            ))
          )}
        </ul>
      </SortableContext>
    </div>
  );
}

function GrabIcon() {
  return (
    <svg
      width="10"
      height="14"
      viewBox="0 0 10 14"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="2.5" cy="2" r="1.5" />
      <circle cx="7.5" cy="2" r="1.5" />
      <circle cx="2.5" cy="7" r="1.5" />
      <circle cx="7.5" cy="7" r="1.5" />
      <circle cx="2.5" cy="12" r="1.5" />
      <circle cx="7.5" cy="12" r="1.5" />
    </svg>
  );
}
