"use client";

import { useState } from "react";
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
import { NoteRow, ReorderUpdate } from "@/lib/notes";
import { LabelRow } from "@/lib/labels";
import { ColumnContainer } from "./ColumnContainer";

type Props = {
  columns: ColumnRow[];
  notes: NoteRow[];
  loading: boolean;
  error: string | null;
  noteLabelMap: Record<string, LabelRow[]>;
  onAddNote: (content: string, columnId: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onMoveNote: (id: string, columnId: string) => Promise<void>;
  onReorderNotes: (updates: ReorderUpdate[]) => Promise<boolean>;
  onReorderColumns: (orderedIds: string[]) => Promise<void>;
  onOpenNote: (noteId: string) => void;
};

export function Board({
  columns,
  notes,
  loading,
  error,
  noteLabelMap,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onMoveNote,
  onReorderNotes,
  onReorderColumns,
  onOpenNote,
}: Props) {
  // --- Note drag state ---
  const [localNotes, setLocalNotes] = useState<NoteRow[]>([]);
  const [isDraggingNote, setIsDraggingNote] = useState(false);
  const [activeNote, setActiveNote] = useState<NoteRow | null>(null);

  // --- Column drag state ---
  const [localColumns, setLocalColumns] = useState<ColumnRow[]>([]);
  const [isDraggingColumn, setIsDraggingColumn] = useState(false);
  const [activeColumn, setActiveColumn] = useState<ColumnRow | null>(null);

  // Sorted columns for stable render order
  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);

  const displayNotes = isDraggingNote ? localNotes : notes;
  const displayColumns = isDraggingColumn ? localColumns : sortedColumns;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function noteSortCmp(a: NoteRow, b: NoteRow): number {
    return a.position - b.position || a.created_at.localeCompare(b.created_at);
  }

  function getNotesForColumn(colId: string): NoteRow[] {
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

    // NOTE drag
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
      // Reorder columns: accept when over another column directly, or derive
      // the target column when hovering over a note inside a column.
      let targetColId: string | null = null;

      if (columns.some((c) => c.id === overId)) {
        targetColId = overId;
      } else {
        // Hovering over a note — find which column it belongs to
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

    // ── NOTE drag (existing logic, unchanged) ─────────────────────────────────

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
        // Same-column reorder
        const colId = dragged.column_id;
        const colNotes = prev.filter((n) => n.column_id === colId);
        const fromIdx = colNotes.findIndex((n) => n.id === active.id);
        const toIdx = colNotes.findIndex((n) => n.id === overId);
        if (fromIdx === toIdx) return prev;
        const reordered = arrayMove(colNotes, fromIdx, toIdx);
        return [...prev.filter((n) => n.column_id !== colId), ...reordered];
      } else {
        // Cross-column: insert at the hovered note's position
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

      // Only persist if order actually changed
      const originalOrder = sortedColumns.map((c) => c.id);
      const newOrder = localColumns.map((c) => c.id);
      const changed = originalOrder.some((id, i) => id !== newOrder[i]);

      if (changed) {
        await onReorderColumns(newOrder);
      }

      setIsDraggingColumn(false);
      return;
    }

    // ── NOTE drag end (existing logic, unchanged) ─────────────────────────────

    setActiveNote(null);

    if (!over) {
      setIsDraggingNote(false);
      return;
    }

    const colOrderKey = (notesList: NoteRow[], colId: string) =>
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

    const updates: ReorderUpdate[] = [];
    if (touchedColIds.size > 0) {
      const colGroups = new Map<string, NoteRow[]>();
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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {displayColumns.map((col) => (
            <ColumnContainer
              key={col.id}
              column={col}
              notes={getNotesForColumn(col.id)}
              allColumns={displayColumns}
              noteLabelMap={noteLabelMap}
              onAddNote={(content) => onAddNote(content, col.id)}
              onDeleteNote={onDeleteNote}
              onUpdateNote={onUpdateNote}
              onMoveNote={onMoveNote}
              onOpenNote={onOpenNote}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeNote && (
          <div className="w-72 rounded-md border border-neutral-700 bg-neutral-900 p-3 shadow-2xl">
            <p className="whitespace-pre-wrap text-sm">{activeNote.content}</p>
          </div>
        )}
        {activeColumn && (
          <div className="w-72 flex-shrink-0 rounded-lg border border-neutral-600 bg-neutral-900 p-3 shadow-2xl opacity-90">
            <div className="flex items-center gap-2">
              {activeColumn.color && (
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: activeColumn.color }}
                />
              )}
              <h2 className="flex-1 text-sm font-semibold text-neutral-200">
                {activeColumn.name}
              </h2>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
