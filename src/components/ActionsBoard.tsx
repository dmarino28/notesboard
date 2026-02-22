"use client";

// ActionsBoard — DnD board for personal action states.
// Three fixed columns: Needs Action | Waiting | Done.
// Dragging between columns updates action_state only — never touches placements.

import { useState } from "react";
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
import type { BucketedNote, ActionState } from "@/lib/userActions";

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
  /** Called when a drag moves a card to a different column; caller must persist. */
  onStateChange: (noteId: string, newState: ActionState) => void;
  /** Called when the user clicks a card (not dragging). */
  onOpenCard: (noteId: string) => void;
};

export function ActionsBoard({ cards, onStateChange, onOpenCard }: Props) {
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
    // Stable sort: earliest effective_due_date first, null dates last, then note_id.
    return displayCards
      .filter((c) => c.action_state === state)
      .sort((a, b) => {
        if (a.effective_due_date && b.effective_due_date)
          return a.effective_due_date.localeCompare(b.effective_due_date);
        if (a.effective_due_date) return -1;
        if (b.effective_due_date) return 1;
        return a.note_id.localeCompare(b.note_id);
      });
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
    // Only respond when dragged over a registered column droppable.
    if (!ACTION_STATES.includes(targetState)) return;

    // Optimistically move card to target column so the user sees it land.
    setLocalCards((prev) =>
      prev.map((c) =>
        c.note_id === active.id ? { ...c, action_state: targetState } : c,
      ),
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setIsDragging(false);
    setActiveCard(null);

    // Dropped outside any column — UI reverts automatically (displayCards → cards prop).
    if (!over) return;

    const targetState = over.id as ActionState;
    if (!ACTION_STATES.includes(targetState)) return;

    // Persist only if the column actually changed.
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
      {/* Board canvas — horizontal scroll, same thin-scrollbar style as main board */}
      <div className="flex h-full min-w-0 gap-4 overflow-x-auto px-4 py-4 nb-board-scroll">
        {ACTION_STATES.map((state) => (
          <ActionColumn
            key={state}
            meta={COL_META[state]}
            cards={getCardsForColumn(state)}
            onOpen={onOpenCard}
          />
        ))}
      </div>

      {/* Drag ghost — dark card, no content truncation issues */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? <ActionCardGhost card={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
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
  // useDroppable so empty-column drops (no cards below) are detected.
  const { setNodeRef, isOver } = useDroppable({
    id: meta.state,
    data: { type: "ACTION_COL" },
  });

  return (
    <div className="flex max-h-[calc(100vh-100px)] w-72 flex-shrink-0 flex-col rounded-xl bg-neutral-900 shadow-xl shadow-black/40 ring-1 ring-inset ring-white/[0.03]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2.5">
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${meta.dotClass}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          {meta.label}
        </span>
        <span className="ml-auto text-[11px] text-neutral-600">{cards.length}</span>
      </div>

      {/* Card list — droppable area highlights when a card is dragged over */}
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
    // useDraggable gives absolute offset — apply as translate so card stays in flow.
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
      // Click opens the modal; check !isDragging so quick taps don't misfire.
      onClick={() => { if (!isDragging) onOpen(card.note_id); }}
      className="cursor-grab active:cursor-grabbing rounded-xl border border-white/[0.07] bg-neutral-800/60 p-3 shadow-sm shadow-black/30 transition-all duration-200 ease-out hover:scale-[1.01] hover:border-white/[0.12] hover:bg-neutral-800/80 hover:shadow-md hover:shadow-black/45"
    >
      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-tight text-neutral-100">
        {card.content}
      </p>
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
    </li>
  );
}

// ── Drag overlay ghost ────────────────────────────────────────────────────────

function ActionCardGhost({ card }: { card: BucketedNote }) {
  return (
    // Dark ghost — same style used by main board drag overlay
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
