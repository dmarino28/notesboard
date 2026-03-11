"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  MeasuringStrategy,
  rectIntersection,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ColumnRow } from "@/lib/columns";
import { PlacedNoteRow, PlacementReorderUpdate } from "@/lib/placements";
import { LabelRow } from "@/lib/labels";
import { BoardRow } from "@/lib/boards";
import { ColumnContainer } from "./ColumnContainer";
import { NoteItem } from "./NoteItem";
import { NoteComposer } from "./NoteComposer";

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
  onHighlightToggle?: (noteId: string, val: boolean) => void;
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
  onHighlightToggle,
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

  // --- Mobile tab state ---
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [movingPlacementId, setMovingPlacementId] = useState<string | null>(null);
  const swipeRef = useRef<HTMLDivElement>(null);

  // Sorted columns for stable render order
  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);

  // Sync activeColumnId: keep current if still valid; else reset to first + scroll to start.
  useEffect(() => {
    const valid = activeColumnId && sortedColumns.some((c) => c.id === activeColumnId);
    if (!valid) {
      setActiveColumnId(sortedColumns[0]?.id ?? null);
      if (swipeRef.current) swipeRef.current.scrollLeft = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const displayNotes = isDraggingNote ? localNotes : notes;
  const displayColumns = isDraggingColumn ? localColumns : sortedColumns;

  const sensors = useSensors(
    // Desktop: instant drag on mouse move ≥ 8px
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Mobile: press-and-hold 260ms before drag activates; up to 8px movement tolerated
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
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

  // ─── Mobile: move note to a different column ─────────────────────────────────

  async function handleMoveNote(placementId: string, targetColumnId: string) {
    const targetNotes = displayNotes.filter((n) => n.column_id === targetColumnId);
    const position = targetNotes.length;
    await onReorderNotes([{ id: placementId, column_id: targetColumnId, position }]);
  }

  // ─── Drag Cancel ────────────────────────────────────────────────────────

  function handleDragCancel() {
    setActiveNote(null);
    setActiveColumn(null);
    setIsDraggingNote(false);
    setIsDraggingColumn(false);
  }

  // ─── Mobile: scroll to a column tab ─────────────────────────────────────

  function scrollToColumn(colId: string) {
    const container = swipeRef.current;
    if (!container) return;
    const idx = displayColumns.findIndex((c) => c.id === colId);
    if (idx === -1) return;
    container.scrollTo({ left: idx * container.clientWidth, behavior: "smooth" });
    setActiveColumnId(colId);
  }

  function handleSwipeScroll() {
    const container = swipeRef.current;
    if (!container) return;
    const idx = Math.round(container.scrollLeft / container.clientWidth);
    const col = displayColumns[idx];
    if (col && col.id !== activeColumnId) {
      setActiveColumnId(col.id);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading board…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const columnIds = displayColumns.map((c) => c.id);

  // Mobile: active column id for tab highlighting
  const activeColId = activeColumnId ?? (displayColumns[0]?.id ?? null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* ── Desktop: full DnD kanban (hidden on mobile) ─────────────────────── */}
      <div className="hidden h-full sm:block">
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className="nb-board-scroll h-full overflow-x-auto overflow-y-hidden">
            <div className="flex h-full items-stretch gap-5 px-6 py-6 pb-8">
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
                  onHighlightToggle={onHighlightToggle}
                />
              ))}
              <AddListStub onAdd={onAddColumn} />
            </div>
          </div>
        </SortableContext>
      </div>

      {/* ── Mobile: column tabs + snap-scroll swipe view (hidden on sm+) ──── */}
      <div className="flex h-full flex-col overflow-hidden sm:hidden">
        {/* Tab bar — horizontally scrollable */}
        <div className="flex-shrink-0 overflow-x-auto border-b border-gray-200 px-3 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-1.5 pb-3">
            {displayColumns.map((col) => {
              const isActive = col.id === activeColId;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => scrollToColumn(col.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-gray-200 text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {col.color && (
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                  )}
                  {col.name}
                  <span className="tabular-nums text-[10px] opacity-50">
                    {getNotesForColumn(col.id).length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Swipe columns — snap-scroll; snap/pan disabled during drag to avoid conflict */}
        <div
          ref={swipeRef}
          onScroll={isDraggingNote ? undefined : handleSwipeScroll}
          className={`flex min-h-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            isDraggingNote
              ? "touch-none overflow-hidden"
              : "touch-pan-x overflow-x-auto scroll-smooth snap-x snap-mandatory"
          }`}
        >
          {displayColumns.map((col) => {
            const colNotes = getNotesForColumn(col.id);
            const colNoteIds = colNotes.map((n) => n.id);
            return (
              <div key={col.id} className="flex h-full w-full shrink-0 snap-start flex-col px-3 pt-3">
                <SortableContext items={colNoteIds} strategy={verticalListSortingStrategy}>
                  <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                    {colNotes.length === 0 ? (
                      <li className="py-8 text-center text-xs text-gray-400">No cards</li>
                    ) : (
                      colNotes.map((note) => (
                        <NoteItem
                          key={note.id}
                          note={note}
                          noteLabels={noteLabelMap[note.note_id] ?? []}
                          hasEmailThread={emailThreadNoteIds.has(note.note_id)}
                          onRemove={onRemoveNote}
                          onUpdate={onUpdateNote}
                          onOpen={() => onOpenNote(note.note_id)}
                          onMoveRequest={(placementId) => setMovingPlacementId(placementId)}
                          onHighlightToggle={onHighlightToggle}
                        />
                      ))
                    )}
                  </ul>
                  <div className="flex-shrink-0 pb-[env(safe-area-inset-bottom,0px)] pt-1">
                    <NoteComposer onAdd={(content) => onAddNote(content, col.id)} />
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeNote && (
          <div className="w-72 scale-[1.03] rounded-xl border border-black/[0.09] bg-white p-3 shadow-card-hover ring-1 ring-indigo-400/20">
            <p className="whitespace-pre-wrap text-sm text-gray-800">{activeNote.content}</p>
          </div>
        )}
        {activeColumn && (
          <div className="w-72 flex-shrink-0 rounded-xl border border-black/[0.06] bg-white/80 p-3 shadow-column opacity-90 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              {activeColumn.color && (
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: activeColumn.color }}
                />
              )}
              <h2 className="flex-1 text-sm font-semibold text-gray-800">
                {activeColumn.name}
              </h2>
            </div>
          </div>
        )}
      </DragOverlay>

      {/* Move-to-column sheet (mobile only) */}
      {movingPlacementId && (
        <MoveSheet
          columns={displayColumns}
          currentColumnId={displayNotes.find((n) => n.id === movingPlacementId)?.column_id ?? null}
          onMove={(targetColId) => {
            void handleMoveNote(movingPlacementId, targetColId);
            setMovingPlacementId(null);
          }}
          onClose={() => setMovingPlacementId(null)}
        />
      )}
    </DndContext>
  );
}

// ─── Move Sheet (mobile: pick a column to move a note into) ──────────────────

function MoveSheet({
  columns,
  currentColumnId,
  onMove,
  onClose,
}: {
  columns: ColumnRow[];
  currentColumnId: string | null;
  onMove: (columnId: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onMouseDown={onClose}
      />
      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-x border-t border-gray-200 bg-white shadow-elevated">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-medium text-gray-800">Move to list</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <ul className="max-h-64 overflow-y-auto py-2">
          {columns.map((col) => (
            <li key={col.id}>
              <button
                type="button"
                disabled={col.id === currentColumnId}
                onClick={() => onMove(col.id)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {col.color && (
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                )}
                <span className="text-gray-700">{col.name}</span>
                {col.id === currentColumnId && (
                  <span className="ml-auto text-[10px] text-gray-400">Current</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </div>
    </>
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
        className="flex w-72 flex-shrink-0 items-center gap-2.5 rounded-xl border border-dashed border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-400 transition-colors hover:border-gray-400 hover:bg-black/[0.02] hover:text-gray-600"
      >
        <span className="text-base leading-none">+</span>
        <span>Add another list</span>
      </button>
    );
  }

  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-xl border border-gray-200 bg-white/75 p-3 shadow-column backdrop-blur-sm">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => void submit()}
        placeholder="List name…"
        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20"
      />
      <div className="flex gap-2">
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            void submit();
          }}
          disabled={!name.trim()}
          className="btn-primary rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Add list
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            setExpanded(false);
            setName("");
          }}
          className="rounded-md px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
