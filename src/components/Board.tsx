"use client";

import { ColumnRow } from "@/lib/columns";
import { NoteRow } from "@/lib/notes";
import { Column } from "./Column";

type Props = {
  columns: ColumnRow[];
  notes: NoteRow[];
  loading: boolean;
  error: string | null;
  onAddNote: (content: string, columnId: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onMoveNote: (id: string, columnId: string) => Promise<void>;
};

export function Board({
  columns,
  notes,
  loading,
  error,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onMoveNote,
}: Props) {
  if (loading) {
    return <p className="text-sm text-neutral-400">Loading board…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (columns.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-neutral-500">
        No columns yet. Use &quot;Manage Columns&quot; to add one.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <Column
          key={col.id}
          column={col}
          notes={notes.filter((n) => n.column_id === col.id)}
          allColumns={columns}
          onAddNote={(content) => onAddNote(content, col.id)}
          onDeleteNote={onDeleteNote}
          onUpdateNote={onUpdateNote}
          onMoveNote={onMoveNote}
        />
      ))}
    </div>
  );
}
