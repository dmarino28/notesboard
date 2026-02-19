"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ColumnRow } from "@/lib/columns";
import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { Column } from "./Column";

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
};

export function ColumnContainer({
  column,
  notes,
  allColumns,
  noteLabelMap,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onMoveNote,
  onOpenNote,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: "COLUMN" },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Column
        column={column}
        notes={notes}
        allColumns={allColumns}
        noteLabelMap={noteLabelMap}
        onAddNote={onAddNote}
        onDeleteNote={onDeleteNote}
        onUpdateNote={onUpdateNote}
        onMoveNote={onMoveNote}
        onOpenNote={onOpenNote}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
      />
    </div>
  );
}
