"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { ColumnRow } from "@/lib/columns";
import { PlacedNoteRow } from "@/lib/placements";
import { LabelRow } from "@/lib/labels";
import { BoardRow } from "@/lib/boards";
import { NoteComposer } from "./NoteComposer";
import { NoteItem } from "./NoteItem";
import { ListHeader } from "./ListHeader";

type Props = {
  column: ColumnRow;
  notes: PlacedNoteRow[];
  noteLabelMap: Record<string, LabelRow[]>;
  emailThreadNoteIds: Set<string>;
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
  onEditingChange: (editing: boolean) => void;
  dragHandleListeners?: DraggableSyntheticListeners;
  dragHandleAttributes?: DraggableAttributes;
  onHighlightToggle?: (noteId: string, val: boolean) => void;
};

export function Column({
  column,
  notes,
  noteLabelMap,
  emailThreadNoteIds,
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
  onEditingChange,
  dragHandleListeners,
  dragHandleAttributes,
  onHighlightToggle,
}: Props) {
  // NoteItem sortable id = placement_id = note.id
  const noteIds = notes.map((n) => n.id);

  // ── Collapsed rail ─────────────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <div
        className="flex w-14 flex-shrink-0 cursor-grab flex-col items-center gap-2 self-stretch rounded-xl bg-white/75 py-3 shadow-column ring-1 ring-inset ring-black/[0.05] backdrop-blur-sm transition-all duration-150 hover:shadow-[0_4px_18px_rgba(0,0,0,0.10)] hover:ring-black/[0.08] active:cursor-grabbing"
        onClick={onToggleCollapse}
        {...dragHandleListeners}
        {...dragHandleAttributes}
      >
        {/* Dot — tertiary, top */}
        {column.color && (
          <span
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full opacity-60"
            style={{ backgroundColor: column.color }}
          />
        )}

        {/* Name — primary, vertical */}
        <span
          className="flex-1 select-none overflow-hidden text-[11px] font-medium text-gray-700"
          title={column.name}
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            maxHeight: "180px",
          }}
        >
          {column.name}
        </span>

        {/* Count — secondary, bottom */}
        <span className="tabular-nums text-[10px] text-gray-400">{notes.length}</span>
      </div>
    );
  }

  // ── Expanded column ────────────────────────────────────────────────────────
  return (
    <div
      className="flex max-h-[calc(100vh-100px)] w-72 flex-shrink-0 flex-col rounded-xl bg-white/75 shadow-column ring-1 ring-inset ring-black/[0.05] backdrop-blur-sm"
    >
      {/* Colored accent bar — replaces tinted header bg */}
      {column.color && (
        <div
          className="h-[3px] w-full flex-shrink-0 rounded-tl-xl rounded-tr-xl"
          style={{ backgroundColor: column.color }}
        />
      )}

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
        headerBg={undefined}
      />

      {/* Card list — scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
          <ul className="min-h-8 space-y-2.5">
            {notes.length === 0 ? (
              <li className="py-4 text-center text-xs text-gray-400">No cards</li>
            ) : (
              notes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  noteLabels={noteLabelMap[note.note_id] ?? []}
                  hasEmailThread={emailThreadNoteIds.has(note.note_id)}
                  onRemove={onRemoveNote}
                  onUpdate={onUpdateNote}
                  onOpen={() => onOpenNote(note.note_id)}
                  onHighlightToggle={onHighlightToggle}
                />
              ))
            )}
          </ul>
        </SortableContext>
      </div>

      {/* Composer — pinned at bottom */}
      <div className="flex-shrink-0 px-2 pb-2.5 pt-1">
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

// Blends a color over the light panel background (#EBEDF0) to produce a solid rgb value.
// Avoids transparency bleed-through when columns sit on varying canvas backgrounds.
function hexBlendOnDark(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const baseR = 235, baseG = 237, baseB = 240; // #EBEDF0 (light panel bg)
  const br = Math.round(baseR + (r - baseR) * alpha);
  const bg = Math.round(baseG + (g - baseG) * alpha);
  const bb = Math.round(baseB + (b - baseB) * alpha);
  return `rgb(${br}, ${bg}, ${bb})`;
}
