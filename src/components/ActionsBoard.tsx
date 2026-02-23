"use client";

// ActionsBoard — DnD board for personal action states.
// Three fixed columns: Needs Action | Waiting | Done.
// Dragging between columns updates action_state only — never touches placements.

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { BucketedNote, ActionState, ViewFilters, SavedView } from "@/lib/userActions";
import { DEFAULT_FILTERS } from "@/lib/userActions";

// ── Column metadata ───────────────────────────────────────────────────────────

const ACTION_STATES: ActionState[] = ["needs_action", "waiting", "done"];

type ColMeta = {
  state: ActionState;
  label: string;
  dotClass: string;
};

const COL_META: Record<ActionState, ColMeta> = {
  needs_action: { state: "needs_action", label: "Needs Action", dotClass: "bg-orange-400" },
  waiting:      { state: "waiting",      label: "Waiting",      dotClass: "bg-sky-400"    },
  done:         { state: "done",         label: "Done",         dotClass: "bg-emerald-400" },
};

// ── Board ─────────────────────────────────────────────────────────────────────

type Props = {
  cards: BucketedNote[];
  allCategories: string[];
  filters: ViewFilters;
  savedViews: SavedView[];
  activeViewId: string | null;
  /** Called when a drag moves a card to a different column; caller must persist. */
  onStateChange: (noteId: string, newState: ActionState) => void;
  /** Called when the user clicks a card (not dragging). */
  onOpenCard: (noteId: string) => void;
  onFiltersChange: (f: ViewFilters) => void;
  onSaveView: (name: string) => void;
  onLoadView: (view: SavedView) => void;
  onDeleteView: (viewId: string) => void;
};

export function ActionsBoard({
  cards,
  allCategories,
  filters,
  savedViews,
  activeViewId,
  onStateChange,
  onOpenCard,
  onFiltersChange,
  onSaveView,
  onLoadView,
  onDeleteView,
}: Props) {
  // localCards drives visual layout only during an active drag.
  const [localCards, setLocalCards] = useState<BucketedNote[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeCard, setActiveCard] = useState<BucketedNote | null>(null);

  // Use cards prop when idle, localCards when dragging (optimistic cross-column moves).
  const displayCards = isDragging ? localCards : cards;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function getCardsForColumn(state: ActionState): BucketedNote[] {
    const col = displayCards.filter((c) => c.action_state === state);

    if (filters.sort === "due_asc") {
      return col.sort((a, b) => {
        if (a.effective_due_date && b.effective_due_date)
          return a.effective_due_date.localeCompare(b.effective_due_date);
        if (a.effective_due_date) return -1;
        if (b.effective_due_date) return 1;
        return a.note_id.localeCompare(b.note_id);
      });
    }
    // added_asc — keep API/fetch order, stable secondary by note_id
    return col.sort((a, b) => a.note_id.localeCompare(b.note_id));
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    const card = cards.find((c) => c.note_id === active.id);
    if (!card) return;
    setLocalCards([...cards]);
    setActiveCard(card);
    setIsDragging(true);
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const targetState = over.id as ActionState;
    if (!ACTION_STATES.includes(targetState)) return;

    setLocalCards((prev) =>
      prev.map((c) =>
        c.note_id === active.id ? { ...c, action_state: targetState } : c,
      ),
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setIsDragging(false);
    setActiveCard(null);

    if (!over) return;
    const targetState = over.id as ActionState;
    if (!ACTION_STATES.includes(targetState)) return;

    const originalState = cards.find((c) => c.note_id === active.id)?.action_state;
    if (originalState && targetState !== originalState) {
      onStateChange(active.id as string, targetState);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {/* Toolbar */}
        <ActionsBoardToolbar
          filters={filters}
          savedViews={savedViews}
          activeViewId={activeViewId}
          allCategories={allCategories}
          onFiltersChange={onFiltersChange}
          onSaveView={onSaveView}
          onLoadView={onLoadView}
          onDeleteView={onDeleteView}
        />

        {/* Board canvas — horizontal scroll */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-4 pb-4 nb-board-scroll">
          {ACTION_STATES.map((state) => (
            <ActionColumn
              key={state}
              meta={COL_META[state]}
              cards={getCardsForColumn(state)}
              onOpen={onOpenCard}
            />
          ))}
        </div>
      </div>

      {/* Drag ghost */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? <ActionCardGhost card={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function ActionsBoardToolbar({
  filters,
  savedViews,
  activeViewId,
  allCategories,
  onFiltersChange,
  onSaveView,
  onLoadView,
  onDeleteView,
}: {
  filters: ViewFilters;
  savedViews: SavedView[];
  activeViewId: string | null;
  allCategories: string[];
  onFiltersChange: (f: ViewFilters) => void;
  onSaveView: (name: string) => void;
  onLoadView: (view: SavedView) => void;
  onDeleteView: (viewId: string) => void;
}) {
  const [catOpen, setCatOpen] = useState(false);
  const [viewDropOpen, setViewDropOpen] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.dueFilter !== "all" ||
    filters.sort !== "due_asc" ||
    filters.search.trim() !== "";

  const activeView = savedViews.find((v) => v.id === activeViewId) ?? null;

  function handleSaveView() {
    const name = newViewName.trim();
    if (!name) return;
    onSaveView(name);
    setNewViewName("");
    setSavingView(false);
  }

  function toggleCategory(cat: string) {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    onFiltersChange({ ...filters, categories: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.04] px-4 py-2">
      {/* ── View selector ── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setViewDropOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
        >
          <span className="text-neutral-600">View:</span>
          <span className={activeView ? "text-indigo-300" : "text-neutral-300"}>
            {activeView ? activeView.name : "All"}
          </span>
          <span className="text-neutral-600">▾</span>
        </button>

        {viewDropOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-white/[0.08] bg-neutral-900 py-1 shadow-xl shadow-black/50">
            {/* All (reset) */}
            <button
              type="button"
              onClick={() => {
                onFiltersChange(DEFAULT_FILTERS);
                onLoadView({ id: "", name: "All", filters: DEFAULT_FILTERS, created_at: "" });
                setViewDropOpen(false);
              }}
              className={`flex w-full items-center px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.04] ${
                !activeViewId ? "text-indigo-300" : "text-neutral-400"
              }`}
            >
              All
            </button>
            {savedViews.map((v) => (
              <div key={v.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    onLoadView(v);
                    setViewDropOpen(false);
                  }}
                  className={`flex-1 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.04] ${
                    activeViewId === v.id ? "text-indigo-300" : "text-neutral-400"
                  }`}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteView(v.id);
                    setViewDropOpen(false);
                  }}
                  className="pr-3 text-[10px] text-neutral-700 transition-colors hover:text-red-400"
                  title="Delete view"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Save view ── */}
      {!activeViewId && hasActiveFilters && !savingView && (
        <button
          type="button"
          onClick={() => {
            setSavingView(true);
            setTimeout(() => saveInputRef.current?.focus(), 0);
          }}
          className="rounded-md border border-dashed border-white/[0.07] px-2.5 py-1 text-[11px] text-neutral-600 transition-colors hover:border-white/[0.12] hover:text-neutral-400"
        >
          Save view
        </button>
      )}
      {savingView && (
        <div className="flex items-center gap-1.5">
          <input
            ref={saveInputRef}
            className="w-28 rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
            placeholder="View name…"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveView();
              if (e.key === "Escape") { setSavingView(false); setNewViewName(""); }
            }}
          />
          <button
            type="button"
            onClick={handleSaveView}
            disabled={!newViewName.trim()}
            className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setSavingView(false); setNewViewName(""); }}
            className="text-[11px] text-neutral-600 hover:text-neutral-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Separator */}
      <span className="h-4 w-px bg-white/[0.06]" />

      {/* ── Category filter ── */}
      {allCategories.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setCatOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
              filters.categories.length > 0
                ? "border-indigo-900/40 bg-indigo-950/40 text-indigo-300"
                : "border-white/[0.07] bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
            }`}
          >
            Categories
            {filters.categories.length > 0 && (
              <span className="rounded-full bg-indigo-600/40 px-1.5 text-[10px] font-semibold text-indigo-200">
                {filters.categories.length}
              </span>
            )}
            <span className="text-neutral-600">▾</span>
          </button>

          {catOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-white/[0.08] bg-neutral-900 py-1.5 shadow-xl shadow-black/50">
              {allCategories.map((cat) => (
                <label
                  key={cat}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.04]"
                >
                  <input
                    type="checkbox"
                    className="accent-indigo-500"
                    checked={filters.categories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                  />
                  {cat}
                </label>
              ))}
              {filters.categories.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onFiltersChange({ ...filters, categories: [] });
                    setCatOpen(false);
                  }}
                  className="mt-1 w-full border-t border-white/[0.04] px-3 py-1 text-left text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Due filter ── */}
      <select
        className="rounded-md border border-white/[0.07] bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400 outline-none transition-colors hover:border-white/[0.12] focus:border-indigo-500/40"
        value={filters.dueFilter}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            dueFilter: e.target.value as ViewFilters["dueFilter"],
          })
        }
      >
        <option value="all">Due: All</option>
        <option value="overdue">Overdue</option>
        <option value="today">Today</option>
        <option value="this_week">This week</option>
      </select>

      {/* ── Sort ── */}
      <select
        className="rounded-md border border-white/[0.07] bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400 outline-none transition-colors hover:border-white/[0.12] focus:border-indigo-500/40"
        value={filters.sort}
        onChange={(e) =>
          onFiltersChange({ ...filters, sort: e.target.value as ViewFilters["sort"] })
        }
      >
        <option value="due_asc">Sort: Due date</option>
        <option value="added_asc">Sort: Date added</option>
      </select>

      {/* ── Search ── */}
      <input
        type="text"
        placeholder="Search…"
        className="w-36 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-neutral-300 outline-none placeholder:text-neutral-600 transition-colors focus:border-indigo-500/40"
        value={filters.search}
        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
      />

      {/* Clear all filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onFiltersChange(DEFAULT_FILTERS)}
          className="text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function ActionColumn({
  meta,
  cards,
  onOpen,
}: {
  meta: ColMeta;
  cards: BucketedNote[];
  onOpen: (noteId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: meta.state,
    data: { type: "ACTION_COL" },
  });

  return (
    <div className="flex max-h-full w-72 flex-shrink-0 flex-col rounded-xl bg-neutral-900 shadow-xl shadow-black/40 ring-1 ring-inset ring-white/[0.03]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2.5">
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${meta.dotClass}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          {meta.label}
        </span>
        <span className="ml-auto text-[11px] text-neutral-600">{cards.length}</span>
      </div>

      {/* Card list */}
      <div
        ref={setNodeRef}
        className={`min-h-0 flex-1 overflow-y-auto px-2 py-1.5 transition-colors duration-100 nb-scroll ${
          isOver ? "bg-white/[0.015]" : ""
        }`}
      >
        <ul className="min-h-8 space-y-2">
          {cards.length === 0 ? (
            <li className="py-6 text-center text-xs text-neutral-700">
              Drop here
            </li>
          ) : (
            cards.map((card) => (
              <ActionCardItem key={card.note_id} card={card} onOpen={onOpen} />
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

// ── Draggable card ────────────────────────────────────────────────────────────

function ActionCardItem({
  card,
  onOpen,
}: {
  card: BucketedNote;
  onOpen: (noteId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.note_id,
    data: { type: "ACTION_CARD", action_state: card.action_state },
  });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.2 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { if (!isDragging) onOpen(card.note_id); }}
      className="cursor-grab active:cursor-grabbing rounded-xl border border-white/[0.07] bg-neutral-800/60 p-3 shadow-sm shadow-black/30 transition-all duration-200 ease-out hover:scale-[1.01] hover:border-white/[0.12] hover:bg-neutral-800/80 hover:shadow-md hover:shadow-black/45"
    >
      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-tight text-neutral-100">
        {card.content}
      </p>

      {/* Due date badge */}
      {card.effective_due_date && formatActionDate(card.effective_due_date) && (
        <div className="mt-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isOverdue(card.effective_due_date) && card.action_state !== "done"
                ? "bg-red-950/60 text-red-400"
                : "bg-neutral-800/60 text-neutral-500"
            }`}
          >
            {card.action_state === "done" ? "Was due" : "Due"}{" "}
            {formatActionDate(card.effective_due_date)}
            {card.personal_due_date ? " (personal)" : ""}
          </span>
        </div>
      )}

      {/* Category chips — up to 2 shown */}
      {card.private_tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {card.private_tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-neutral-700/40 px-1.5 py-0.5 text-[10px] text-neutral-500"
            >
              {tag}
            </span>
          ))}
          {card.private_tags.length > 2 && (
            <span className="text-[10px] text-neutral-600">
              +{card.private_tags.length - 2}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// ── Drag overlay ghost ────────────────────────────────────────────────────────

function ActionCardGhost({ card }: { card: BucketedNote }) {
  return (
    <div className="w-72 cursor-grabbing rounded-xl border border-white/[0.14] bg-neutral-800/90 p-3 shadow-md shadow-black/45">
      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-tight text-neutral-100">
        {card.content}
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatActionDate(dateStr: string): string | null {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return !isNaN(d.getTime()) && d < new Date();
}
