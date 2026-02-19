"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { ColumnRow } from "@/lib/columns";
import { NoteRow } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { BoardRow } from "@/lib/boards";
import { NoteComposer } from "./NoteComposer";
import { NoteItem } from "./NoteItem";
import { ListHeader } from "./ListHeader";

type Props = {
  column: ColumnRow;
  notes: NoteRow[];
  noteLabelMap: Record<string, LabelRow[]>;
  boards: BoardRow[];
  currentBoardId: string;
  isCollapsed: boolean;
  onAddNote: (content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onOpenNote: (noteId: string) => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
  onUpdateColor: (color: string) => void;
  onMoveToBoard: (targetBoardId: string) => void;
  onCopyToBoard: (targetBoardId: string) => void;
  onToggleCollapse: () => void;
  onEditingChange: (editing: boolean) => void;
  dragHandleListeners?: DraggableSyntheticListeners;
  dragHandleAttributes?: DraggableAttributes;
};

export function Column({
  column,
  notes,
  noteLabelMap,
  boards,
  currentBoardId,
  isCollapsed,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onOpenNote,
  onRename,
  onDelete,
  onUpdateColor,
  onMoveToBoard,
  onCopyToBoard,
  onToggleCollapse,
  onEditingChange,
  dragHandleListeners,
  dragHandleAttributes,
}: Props) {
  const noteIds = notes.map((n) => n.id);

  const headerBg = column.color ? hexToRgba(column.color, 0.22) : undefined;
  const bodyBg = column.color ? hexToRgba(column.color, 0.08) : undefined;

  // ── Collapsed pill ─────────────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <div
        className="flex w-14 flex-shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl border border-white/8 bg-neutral-800/55 py-3 shadow-lg backdrop-blur-sm"
        style={bodyBg ? { backgroundColor: bodyBg } : undefined}
        onClick={onToggleCollapse}
        title={`${column.name} (${notes.length} cards) — click to expand`}
      >
        {column.color && (
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: column.color }}
          />
        )}
        <span
          className="flex-1 select-none truncate text-xs font-semibold text-neutral-400"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            maxHeight: "160px",
          }}
        >
          {column.name}
        </span>
        <span className="tabular-nums text-xs text-neutral-600">{notes.length}</span>
      </div>
    );
  }

  // ── Expanded column ────────────────────────────────────────────────────────
  return (
    <div
      className="flex max-h-[calc(100vh-100px)] w-72 flex-shrink-0 flex-col rounded-xl border border-white/8 bg-neutral-800/55 shadow-lg backdrop-blur-sm"
      style={bodyBg ? { backgroundColor: bodyBg } : undefined}
    >
      <ListHeader
        column={column}
        noteCount={notes.length}
        boards={boards}
        currentBoardId={currentBoardId}
        dragHandleListeners={dragHandleListeners}
        dragHandleAttributes={dragHandleAttributes}
        onRename={onRename}
        onUpdateColor={onUpdateColor}
        onMoveToBoard={onMoveToBoard}
        onCopyToBoard={onCopyToBoard}
        onDelete={onDelete}
        onEditingChange={onEditingChange}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        headerBg={headerBg}
      />

      {/* Card list — scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
          <ul className="min-h-8 space-y-2">
            {notes.length === 0 ? (
              <li className="py-4 text-center text-xs text-neutral-600">No cards</li>
            ) : (
              notes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  noteLabels={noteLabelMap[note.id] ?? []}
                  onDelete={onDeleteNote}
                  onUpdate={onUpdateNote}
                  onOpen={() => onOpenNote(note.id)}
                />
              ))
            )}
          </ul>
        </SortableContext>
      </div>

      {/* Composer — pinned at bottom */}
      <div className="flex-shrink-0 px-2 pb-2 pt-1">
        <NoteComposer onAdd={onAddNote} />
      </div>
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
