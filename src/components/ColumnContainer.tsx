"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ColumnRow } from "@/lib/columns";
import { PlacedNoteRow } from "@/lib/placements";
import { LabelRow } from "@/lib/labels";
import { BoardRow } from "@/lib/boards";
import { Column } from "./Column";

type Props = {
  column: ColumnRow;
  notes: PlacedNoteRow[];
  noteLabelMap: Record<string, LabelRow[]>;
  boards: BoardRow[];
  currentBoardId: string;
  isCollapsed: boolean;
  onAddNote: (content: string) => Promise<void>;
  onRemoveNote: (placementId: string) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
  onOpenNote: (noteId: string) => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
  onUpdateColor: (color: string) => void;
  onMoveToBoard: (targetBoardId: string) => void;
  onCopyToBoard: (targetBoardId: string) => void;
  onToggleCollapse: () => void;
};

export function ColumnContainer({
  column,
  notes,
  noteLabelMap,
  boards,
  currentBoardId,
  isCollapsed,
  onAddNote,
  onRemoveNote,
  onUpdateNote,
  onOpenNote,
  onRename,
  onDelete,
  onUpdateColor,
  onMoveToBoard,
  onCopyToBoard,
  onToggleCollapse,
}: Props) {
  // Disabled while the title is being inline-edited so typing doesn't start a drag
  const [sortableDisabled, setSortableDisabled] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: "COLUMN" },
    disabled: sortableDisabled,
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
        noteLabelMap={noteLabelMap}
        boards={boards}
        currentBoardId={currentBoardId}
        isCollapsed={isCollapsed}
        onAddNote={onAddNote}
        onRemoveNote={onRemoveNote}
        onUpdateNote={onUpdateNote}
        onOpenNote={onOpenNote}
        onRename={onRename}
        onDelete={onDelete}
        onUpdateColor={onUpdateColor}
        onMoveToBoard={onMoveToBoard}
        onCopyToBoard={onCopyToBoard}
        onToggleCollapse={onToggleCollapse}
        onEditingChange={setSortableDisabled}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
      />
    </div>
  );
}
