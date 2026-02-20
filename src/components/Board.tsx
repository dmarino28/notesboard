"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ColumnRow } from "@/lib/columns";
import { PlacedNoteRow, PlacementReorderUpdate } from "@/lib/placements";
import { LabelRow } from "@/lib/labels";
import { BoardRow } from "@/lib/boards";
import { ColumnContainer } from "./ColumnContainer";

type Props = {
  columns: ColumnRow[];
  notes: PlacedNoteRow[];
  loading: boolean;
  error: string | null;
  noteLabelMap: Record<string, LabelRow[]>;
  emailThreadNoteIds: Set<string>;
  boards: BoardRow[];
  currentBoardId: string;
  onAddNote: (content: string, columnId: string) => Promise<void>;
  onRemoveNote: (placementId: string) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
  onReorderNotes: (updates: PlacementReorderUpdate[]) => Promise<boolean>;
  onReorderColumns: (orderedIds: string[]) => Promise<void>;
  onAddColumn: (name: string) => Promise<void>;
  onOpenNote: (noteId: string) => void;
  onRenameColumn: (id: string, name: string) => Promise<void>;
  onDeleteColumn: (id: string) => Promise<void>;
  onUpdateColumnColor: (id: string, color: string) => void;
  onMoveColumnToBoard: (columnId: string, targetBoardId: string) => Promise<void>;
  onCopyColumnToBoard: (columnId: string, targetBoardId: string) => Promise<void>;
};

export function Board({
  columns,
  notes,
  loading,
  error,
  noteLabelMap,
  emailThreadNoteIds,
  boards,
  currentBoardId,
  onAddNote,
  onRemoveNote,
  onUpdateNote,
  onReorderNotes,
  onReorderColumns,
  onAddColumn,
  onOpenNote,
  onRenameColumn,
  onDeleteColumn,
  onUpdateColumnColor,
  onMoveColumnToBoard,
  onCopyColumnToBoard,
}: Props) {
  // --- Note drag state ---
  const [localNotes, setLocalNotes] = useState<PlacedNoteRow[]>([]);
  const [isDraggingNote, setIsDraggingNote] = useState(false);
  const [activeNote, setActiveNote] = useState<PlacedNoteRow | null>(null);

  // --- Column drag state ---
  const [localColumns, setLocalColumns] = useState<ColumnRow[]>([]);
  const [isDraggingColumn, setIsDraggingColumn] = useState(false);
  const [activeColumn, setActiveColumn] = useState<ColumnRow | null>(null);

  // --- Collapse state (UI-only; resets on board remount) ---
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());

  // Sorted columns for stable render order
  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);

  const displayNotes = isDraggingNote ? localNotes : notes;
  const displayColumns = isDraggingColumn ? localColumns : sortedColumns;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function toggleCollapse(colId: string) {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  }

  function noteSortCmp(a: PlacedNoteRow, b: PlacedNoteRow): number {
    return a.position - b.position || a.created_at.localeCompare(b.created_at);
  }

  function getNotesForColumn(colId: string): PlacedNoteRow[] {
    const filtered = displayNotes.filter((n) => n.column_id === colId);
    return isDraggingNote ? filtered : [...filtered].sort(noteSortCmp);
  }

  // ─── Drag Start ──────────────────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    const activeType = active.data.current?.type as string | undefined;

    if (activeType === "COLUMN") {
      const col = columns.find((c) => c.id === active.id);
      setActiveColumn(col ?? null);
      setLocalColumns(sortedColumns);
      setIsDraggingColumn(true);
      return;
    }

    // NOTE drag — active.id = placement_id
    const snapshot = [...notes].sort((a, b) => {
      if (a.column_id !== b.column_id) return 0;
      return noteSortCmp(a, b);
    });
    setLocalNotes(snapshot);
    setIsDraggingNote(true);
    setActiveNote(notes.find((n) => n.id === active.id) ?? null);
  }

  // ─── Drag Over ───────────────────────────────────────────────────────────────

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type as string | undefined;
    const overId = over.id as string;

    if (activeType === "COLUMN") {
      let targetColId: string | null = null;

      if (columns.some((c) => c.id === overId)) {
        targetColId = overId;
      } else {
        const overNote = notes.find((n) => n.id === overId);
        if (overNote && overNote.column_id !== active.id) {
          targetColId = overNote.column_id;
        }
      }

      if (!targetColId) return;

      setLocalColumns((prev) => {
        const fromIdx = prev.findIndex((c) => c.id === active.id);
        const toIdx = prev.findIndex((c) => c.id === targetColId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
        return arrayMove(prev, fromIdx, toIdx);
      });
      return;
    }

    // ── NOTE drag — ids are placement_ids ──────────────────────────────────────

    setLocalNotes((prev) => {
      const dragged = prev.find((n) => n.id === active.id);
      if (!dragged) return prev;

      const overIsColumn = columns.some((c) => c.id === overId);

      if (overIsColumn) {
        if (dragged.column_id === overId) return prev;
        return prev.map((n) => (n.id === active.id ? { ...n, column_id: overId } : n));
      }

      const overNote = prev.find((n) => n.id === overId);
      if (!overNote) return prev;

      if (dragged.column_id === overNote.column_id) {
        const colId = dragged.column_id;
        const colNotes = prev.filter((n) => n.column_id === colId);
        const fromIdx = colNotes.findIndex((n) => n.id === active.id);
        const toIdx = colNotes.findIndex((n) => n.id === overId);
        if (fromIdx === toIdx) return prev;
        const reordered = arrayMove(colNotes, fromIdx, toIdx);
        return [...prev.filter((n) => n.column_id !== colId), ...reordered];
      } else {
        const targetColId = overNote.column_id;
        const withoutDragged = prev.filter((n) => n.id !== active.id);
        const targetColNotes = withoutDragged.filter((n) => n.column_id === targetColId);
        const overIdx = targetColNotes.findIndex((n) => n.id === overId);
        const insertAt = overIdx >= 0 ? overIdx : targetColNotes.length;
        const newTargetCol = [
          ...targetColNotes.slice(0, insertAt),
          { ...dragged, column_id: targetColId },
          ...targetColNotes.slice(insertAt),
        ];
        return [...withoutDragged.filter((n) => n.column_id !== targetColId), ...newTargetCol];
      }
    });
  }

  // ─── Drag End ────────────────────────────────────────────────────────────────

  function handleDragEnd(event: DragEndEvent) {
    void handleDragEndAsync(event);
  }

  async function handleDragEndAsync({ active, over }: DragEndEvent) {
    const activeType = active.data.current?.type as string | undefined;

    if (activeType === "COLUMN") {
      setActiveColumn(null);

      const originalOrder = sortedColumns.map((c) => c.id);
      const newOrder = localColumns.map((c) => c.id);
      const changed = originalOrder.some((id, i) => id !== newOrder[i]);

      if (changed) {
        await onReorderColumns(newOrder);
      }

      setIsDraggingColumn(false);
      return;
    }

    setActiveNote(null);

    if (!over) {
      setIsDraggingNote(false);
      return;
    }

    // Determine which columns changed by comparing placement_id order per column
    const colOrderKey = (notesList: PlacedNoteRow[], colId: string) =>
      notesList
        .filter((n) => n.column_id === colId)
        .map((n) => n.id)
        .join(",");

    const allColIds = new Set([
      ...localNotes.map((n) => n.column_id),
      ...notes.map((n) => n.column_id),
    ]);
    const touchedColIds = new Set<string>();
    for (const colId of allColIds) {
      if (colOrderKey(localNotes, colId) !== colOrderKey(notes, colId)) {
        touchedColIds.add(colId);
      }
    }

    const updates: PlacementReorderUpdate[] = [];
    if (touchedColIds.size > 0) {
      const colGroups = new Map<string, PlacedNoteRow[]>();
      for (const note of localNotes) {
        if (!touchedColIds.has(note.column_id)) continue;
        const group = colGroups.get(note.column_id) ?? [];
        group.push(note);
        colGroups.set(note.column_id, group);
      }
      colGroups.forEach((colNotes) => {
        colNotes.forEach((note, idx) => {
          updates.push({ id: note.id, column_id: note.column_id, position: idx });
        });
      });
    }

    if (updates.length > 0) {
      await onReorderNotes(updates);
    }

    setIsDraggingNote(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-neutral-500">Loading board…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  const columnIds = displayColumns.map((c) => c.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
        <div className="h-full overflow-x-auto overflow-y-hidden">
          <div className="flex h-full items-start gap-4 px-6 py-5 pb-6">
            {displayColumns.map((col) => (
              <ColumnContainer
                key={col.id}
                column={col}
                notes={getNotesForColumn(col.id)}
                noteLabelMap={noteLabelMap}
                emailThreadNoteIds={emailThreadNoteIds}
                boards={boards}
                currentBoardId={currentBoardId}
                isCollapsed={collapsedColumns.has(col.id)}
                onAddNote={(content) => onAddNote(content, col.id)}
                onRemoveNote={onRemoveNote}
                onUpdateNote={onUpdateNote}
                onOpenNote={onOpenNote}
                onRename={(name) => onRenameColumn(col.id, name)}
                onDelete={() => onDeleteColumn(col.id)}
                onUpdateColor={(color) => onUpdateColumnColor(col.id, color)}
                onMoveToBoard={(targetBoardId) => onMoveColumnToBoard(col.id, targetBoardId)}
                onCopyToBoard={(targetBoardId) => onCopyColumnToBoard(col.id, targetBoardId)}
                onToggleCollapse={() => toggleCollapse(col.id)}
              />
            ))}
            <AddListStub onAdd={onAddColumn} />
          </div>
        </div>
      </SortableContext>

      <DragOverlay>
        {activeNote && (
          <div className="w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-2xl ring-1 ring-black/5">
            <p className="whitespace-pre-wrap text-sm text-neutral-900">{activeNote.content}</p>
          </div>
        )}
        {activeColumn && (
          <div className="w-72 flex-shrink-0 rounded-xl border border-neutral-600/40 bg-neutral-800/80 p-3 shadow-2xl backdrop-blur-sm opacity-90">
            <div className="flex items-center gap-2">
              {activeColumn.color && (
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: activeColumn.color }}
                />
              )}
              <h2 className="flex-1 text-sm font-semibold text-neutral-100">
                {activeColumn.name}
              </h2>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Add List Stub ────────────────────────────────────────────────────────────

function AddListStub({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const submittingRef = useRef(false);

  function handleExpand() {
    submittingRef.current = false;
    setExpanded(true);
  }

  async function submit() {
    if (submittingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setExpanded(false);
      setName("");
      return;
    }
    submittingRef.current = true;
    try {
      await onAdd(trimmed);
      setName("");
      setExpanded(false);
    } catch {
      submittingRef.current = false;
      setExpanded(false);
      setName("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      setExpanded(false);
      setName("");
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={handleExpand}
        className="flex w-72 flex-shrink-0 items-center gap-2.5 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-neutral-400 transition-colors hover:border-white/25 hover:bg-white/8 hover:text-neutral-200"
      >
        <span className="text-base leading-none">+</span>
        <span>Add another list</span>
      </button>
    );
  }

  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-xl border border-neutral-600/40 bg-neutral-800/60 p-3 shadow-lg">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => void submit()}
        placeholder="List name…"
        className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-neutral-400"
      />
      <div className="flex gap-2">
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            void submit();
          }}
          disabled={!name.trim()}
          className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
        >
          Add list
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            setExpanded(false);
            setName("");
          }}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
