"use client";

// ActionsBoard — personal action items.
// Timed section: 5-column kanban (Overdue/Today/Tomorrow/This Week/Later).
// State trays: Waiting, Done, Tracking (full-width, collapsible).
// Flagged section: accordion groups by tag-def + General.

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type {
  BucketedNote,
  ActionState,
  ViewFilters,
  SavedView,
  MyActionsResult,
  TagDef,
} from "@/lib/userActions";
import { DEFAULT_FILTERS } from "@/lib/userActions";
import { useActions } from "@/lib/ActionContext";
import { timedLabelForDueDate, relativeTimeShort, isWithin24h, upcomingWeekEndStr, type WeekEndDay } from "@/lib/dateUtils";
import { bucketKeyForDueDate } from "@/lib/dateUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  result: MyActionsResult;
  tagDefs: TagDef[];
  allCategories: string[];
  filters: ViewFilters;
  savedViews: SavedView[];
  activeViewId: string | null;
  scope: "my" | "all";
  weekEndDay: WeekEndDay;
  onOpenCard: (noteId: string) => void;
  onFiltersChange: (f: ViewFilters) => void;
  onSaveView: (name: string) => void;
  onLoadView: (view: SavedView) => void;
  onDeleteView: (viewId: string) => void;
  onQuickAction: () => void;
  onManageGroups: () => void;
  onCheckWaiting?: () => void;
  checkWaitingBusy?: boolean;
  onScopeChange: (scope: "my" | "all") => void;
  onWeekEndChange: (day: WeekEndDay) => void;
  onCardDrop: (noteId: string, targetBucket: string, newDate: string | null) => void;
  onCardDropToTray: (noteId: string, tray: "waiting" | "done") => void;
};

// ── Timed bucket column metadata ──────────────────────────────────────────────

const TIMED_COLUMN_BUCKETS = [
  { key: "overdue",   label: "Overdue",   dotClass: "bg-red-400",     glow: "#ef4444" },
  { key: "today",     label: "Today",     dotClass: "bg-blue-400",    glow: "#3b82f6" },
  { key: "tomorrow",  label: "Tomorrow",  dotClass: "bg-amber-400",   glow: "#f59e0b" },
  { key: "this_week", label: "This Week", dotClass: "bg-emerald-400", glow: "#10b981" },
  { key: "later",     label: "Later",     dotClass: "bg-slate-500",   glow: "#64748b" },
] as const;

// ── Date helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Returns the personal_due_date to set when a card is dropped on a bucket.
 * Returns `undefined` for unknown targets (caller should ignore).
 * Returns `null` to clear the due date (→ Tracking).
 */
function resolveDropDate(bucketKey: string, weekEndDay: WeekEndDay): string | null | undefined {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (bucketKey) {
    case "overdue": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return fmtDate(d);
    }
    case "today":    return fmtDate(today);
    case "tomorrow": {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return fmtDate(d);
    }
    case "this_week": return upcomingWeekEndStr(today, weekEndDay);
    case "later": {
      // One week past the upcoming week-end
      const weekEndStr = upcomingWeekEndStr(today, weekEndDay);
      const [y, m, d2] = weekEndStr.split("-").map(Number);
      const weekEnd = new Date(y, m - 1, d2 + 7);
      return fmtDate(weekEnd);
    }
    case "tracking": return null; // clear due date → goes to Tracking
    default:         return undefined;
  }
}

// ── Sort helper ────────────────────────────────────────────────────────────────

function sortCards(cards: BucketedNote[], sort: ViewFilters["sort"]): BucketedNote[] {
  if (sort === "due_asc") {
    return [...cards].sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return a.note_id.localeCompare(b.note_id);
    });
  }
  return [...cards].sort((a, b) => a.note_id.localeCompare(b.note_id));
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ActionsBoard({
  result,
  tagDefs,
  allCategories,
  filters,
  savedViews,
  activeViewId,
  scope,
  weekEndDay,
  onOpenCard,
  onFiltersChange,
  onSaveView,
  onLoadView,
  onDeleteView,
  onQuickAction,
  onManageGroups,
  onCheckWaiting,
  checkWaitingBusy = false,
  onScopeChange,
  onWeekEndChange,
  onCardDrop,
  onCardDropToTray,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Flagged groups
  const sortedDefs = [...tagDefs].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
  const flaggedGroups: Array<{ id: string; label: string; cards: BucketedNote[] }> = [];
  for (const def of sortedDefs) {
    flaggedGroups.push({
      id: def.id,
      label: def.name,
      cards: result.flagged.filter((c) => c.private_tags.includes(def.name)),
    });
  }
  const defNames = new Set(sortedDefs.map((d) => d.name));
  const generalCards = result.flagged.filter(
    (c) => c.private_tags.length === 0 || !c.private_tags.some((t) => defNames.has(t)),
  );
  flaggedGroups.push({ id: "general", label: "General", cards: generalCards });

  const timedTotal =
    result.overdue.length + result.today.length + result.tomorrow.length +
    result.this_week.length + result.later.length + result.waiting.length + result.done.length;
  const flaggedTotal = result.flagged.length;
  const trackingTotal = result.tracking.length;

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: "#0d0f14" }}>
      {/* Scope bar + toolbar */}
      <ScopeBar
        scope={scope}
        weekEndDay={weekEndDay}
        onScopeChange={onScopeChange}
        onWeekEndChange={onWeekEndChange}
      />
      <ActionsBoardToolbar
        filters={filters}
        savedViews={savedViews}
        activeViewId={activeViewId}
        allCategories={allCategories}
        onFiltersChange={onFiltersChange}
        onSaveView={onSaveView}
        onLoadView={onLoadView}
        onDeleteView={onDeleteView}
        onQuickAction={onQuickAction}
        onCheckWaiting={onCheckWaiting}
        checkWaitingBusy={checkWaitingBusy}
      />

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto nb-scroll">

        {/* ── Timed section ── */}
        <div>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Timed
            </h2>
            <span className="text-[11px] text-neutral-700">{timedTotal}</span>
          </div>

          {scope === "my" ? (
            <TimedKanban
              result={result}
              filters={filters}
              weekEndDay={weekEndDay}
              onOpen={onOpenCard}
              onCardDrop={onCardDrop}
              onCardDropToTray={onCardDropToTray}
            />
          ) : (
            <TimedReadOnly
              result={result}
              filters={filters}
              weekEndDay={weekEndDay}
              onOpen={onOpenCard}
            />
          )}
        </div>

        {/* ── State trays + Tracking ── */}
        <div className="space-y-2 px-4 pb-4">
          <CollapsibleTray
            trayKey="waiting"
            label="Waiting"
            dotColor="#a78bfa"
            cards={result.waiting}
            collapsed={collapsed.has("waiting")}
            onToggle={() => toggle("waiting")}
            onOpen={onOpenCard}
            droppable={scope === "my"}
          />
          <CollapsibleTray
            trayKey="done"
            label="Done"
            dotColor="#34d399"
            cards={result.done}
            collapsed={collapsed.has("done")}
            onToggle={() => toggle("done")}
            onOpen={onOpenCard}
            droppable={scope === "my"}
          />
          {scope === "my" && (
            <TrackingTray
              cards={sortCards(result.tracking, filters.sort)}
              collapsed={collapsed.has("tracking")}
              onToggle={() => toggle("tracking")}
              onOpen={onOpenCard}
              total={trackingTotal}
              onCardDrop={onCardDrop}
              weekEndDay={weekEndDay}
            />
          )}
        </div>

        {/* ── Flagged section ── */}
        <section className="px-4 pb-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Flagged
              </h2>
              <span className="text-[11px] text-neutral-700">{flaggedTotal}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onManageGroups}
                  className="rounded-md border border-white/[0.06] px-2 py-0.5 text-[10px] text-neutral-600 transition-colors hover:border-white/[0.10] hover:text-neutral-400"
                >
                  Manage groups
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {flaggedGroups.map((group) => {
                if (group.cards.length === 0) return null;
                const isCollapsed = collapsed.has(group.id);
                return (
                  <FlaggedGroup
                    key={group.id}
                    id={group.id}
                    label={group.label}
                    cards={group.cards}
                    collapsed={isCollapsed}
                    onToggle={() => toggle(group.id)}
                    onOpen={onOpenCard}
                  />
                );
              })}
              {flaggedTotal === 0 && (
                <p className="py-4 text-center text-sm text-neutral-700">
                  No flagged actions.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Scope bar ─────────────────────────────────────────────────────────────────

function ScopeBar({
  scope,
  weekEndDay,
  onScopeChange,
  onWeekEndChange,
}: {
  scope: "my" | "all";
  weekEndDay: WeekEndDay;
  onScopeChange: (s: "my" | "all") => void;
  onWeekEndChange: (d: WeekEndDay) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2">
      {/* Scope toggle */}
      <div className="flex items-center gap-0.5 rounded-[9px] bg-white/[0.04] p-0.5 ring-1 ring-inset ring-white/[0.03]">
        {(["my", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onScopeChange(s)}
            className={`rounded-[7px] px-3 py-1 text-[11px] font-medium transition-all duration-150 ${
              scope === s
                ? "bg-white/[0.08] text-neutral-100 shadow-sm ring-1 ring-inset ring-white/[0.06]"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {s === "my" ? "My Actions" : "All Actions"}
          </button>
        ))}
      </div>

      <span className="h-4 w-px bg-white/[0.06]" />

      {/* Week-end preference */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-neutral-600">Week ends</span>
        <select
          value={weekEndDay}
          onChange={(e) => onWeekEndChange(e.target.value as WeekEndDay)}
          className="rounded-md border border-white/[0.06] bg-transparent px-1.5 py-0.5 text-[11px] text-neutral-400 outline-none transition-colors hover:border-white/[0.10] focus:border-indigo-500/40"
        >
          <option value="friday">Friday</option>
          <option value="saturday">Saturday</option>
          <option value="sunday">Sunday</option>
        </select>
      </div>
    </div>
  );
}

// ── Timed kanban (DnD owner — My Actions scope) ────────────────────────────────

function TimedKanban({
  result,
  filters,
  weekEndDay,
  onOpen,
  onCardDrop,
  onCardDropToTray,
}: {
  result: MyActionsResult;
  filters: ViewFilters;
  weekEndDay: WeekEndDay;
  onOpen: (noteId: string) => void;
  onCardDrop: (noteId: string, targetBucket: string, newDate: string | null) => void;
  onCardDropToTray: (noteId: string, tray: "waiting" | "done") => void;
}) {
  const [activeCard, setActiveCard] = useState<BucketedNote | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as BucketedNote | undefined;
    setActiveCard(card ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const noteId = active.id as string;
    const targetBucket = over.id as string;

    if (targetBucket === "waiting" || targetBucket === "done") {
      onCardDropToTray(noteId, targetBucket);
      return;
    }

    if (targetBucket === "tracking") {
      onCardDrop(noteId, "tracking", null);
      return;
    }

    const newDate = resolveDropDate(targetBucket, weekEndDay);
    if (newDate !== undefined) {
      onCardDrop(noteId, targetBucket, newDate);
    }
  }

  // Flatten all timed + tracking cards and re-bucket from effective due_date.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allTimedCards = [
    ...result.overdue,
    ...result.today,
    ...result.tomorrow,
    ...result.this_week,
    ...result.later,
    ...result.tracking,
  ];
  const derivedBuckets: Record<string, BucketedNote[]> = {
    overdue: [], today: [], tomorrow: [], this_week: [], later: [], tracking: [],
  };

  for (const card of allTimedCards) {
    if (!card.due_date) {
      derivedBuckets["tracking"].push(card);
    } else {
      const key = bucketKeyForDueDate(card.due_date, today, weekEndDay);
      derivedBuckets[key].push(card);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* 5 timed columns */}
      <div className="flex gap-2.5 overflow-x-auto px-4 pb-3 nb-board-scroll">
        {TIMED_COLUMN_BUCKETS.map((b) => (
          <KanbanColumn
            key={b.key}
            bucketKey={b.key}
            label={b.label}
            dotClass={b.dotClass}
            glow={b.glow}
            cards={sortCards(derivedBuckets[b.key] ?? [], filters.sort)}
            onOpen={onOpen}
          />
        ))}
      </div>

      {/* Drag overlay — lifted ghost card */}
      <DragOverlay dropAnimation={null}>
        {activeCard && (
          <div className="w-48 rotate-1 rounded-xl border border-white/[0.10] bg-gradient-to-b from-neutral-800 to-neutral-900 px-3 py-2.5 shadow-2xl shadow-black/70">
            <p className="line-clamp-3 text-[13px] leading-snug text-neutral-100">
              {activeCard.content}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── Timed read-only (All Actions scope — no DnD) ───────────────────────────────

function TimedReadOnly({
  result,
  filters,
  weekEndDay,
  onOpen,
}: {
  result: MyActionsResult;
  filters: ViewFilters;
  weekEndDay: WeekEndDay;
  onOpen: (noteId: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allCards = [
    ...result.overdue, ...result.today, ...result.tomorrow,
    ...result.this_week, ...result.later,
  ];
  const derivedBuckets: Record<string, BucketedNote[]> = {
    overdue: [], today: [], tomorrow: [], this_week: [], later: [],
  };
  for (const card of allCards) {
    if (card.due_date) {
      const key = bucketKeyForDueDate(card.due_date, today, weekEndDay);
      derivedBuckets[key].push(card);
    }
  }

  return (
    <div className="flex gap-2.5 overflow-x-auto px-4 pb-3 nb-board-scroll">
      {TIMED_COLUMN_BUCKETS.map((b) => (
        <KanbanColumn
          key={b.key}
          bucketKey={b.key}
          label={b.label}
          dotClass={b.dotClass}
          glow={b.glow}
          cards={sortCards(derivedBuckets[b.key] ?? [], filters.sort)}
          onOpen={onOpen}
          readOnly
        />
      ))}
    </div>
  );
}

// ── Kanban column (droppable) ─────────────────────────────────────────────────

function KanbanColumn({
  bucketKey,
  label,
  dotClass,
  glow,
  cards,
  onOpen,
  readOnly = false,
}: {
  bucketKey: string;
  label: string;
  dotClass: string;
  glow: string;
  cards: BucketedNote[];
  onOpen: (noteId: string) => void;
  readOnly?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucketKey });

  return (
    <div
      ref={readOnly ? undefined : setNodeRef}
      className={`flex min-w-[180px] flex-1 flex-col rounded-xl border transition-all duration-300 ${
        isOver && !readOnly
          ? "border-white/[0.12] scale-[1.01]"
          : "border-white/[0.06]"
      }`}
      style={{
        background: isOver && !readOnly
          ? `radial-gradient(ellipse at 50% 110%, ${glow}22 0%, transparent 65%), #13151f`
          : `radial-gradient(ellipse at 50% 110%, ${glow}0d 0%, transparent 65%), #13151f`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClass}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-neutral-700">
          {cards.length || ""}
        </span>
      </div>

      {/* Card stack */}
      <div className="flex min-h-[180px] flex-1 flex-col gap-1.5 px-2 pb-2">
        {cards.map((card) =>
          readOnly ? (
            <ActionCardItem key={card.note_id} card={card} onOpen={onOpen} />
          ) : (
            <DraggableCard key={card.note_id} card={card} onOpen={onOpen} />
          )
        )}
      </div>
    </div>
  );
}

// ── Collapsible tray (Waiting / Done) ─────────────────────────────────────────

function CollapsibleTray({
  trayKey,
  label,
  dotColor,
  cards,
  collapsed,
  onToggle,
  onOpen,
  droppable = true,
}: {
  trayKey: string;
  label: string;
  dotColor: string;
  cards: BucketedNote[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (noteId: string) => void;
  droppable?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: trayKey });

  return (
    <div
      ref={droppable ? setNodeRef : undefined}
      className={`rounded-xl border transition-all duration-300 ${
        isOver ? "border-white/[0.12]" : "border-white/[0.05]"
      }`}
      style={{
        background: isOver
          ? `radial-gradient(ellipse at 50% 110%, ${dotColor}1c 0%, transparent 55%), #13151f`
          : "#13151f",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </span>
        <span className="text-[11px] text-neutral-700">{cards.length || ""}</span>
        <span className="ml-auto text-[10px] text-neutral-700">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && cards.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
          {cards.map((card) => (
            <button
              key={card.note_id}
              type="button"
              onClick={() => onOpen(card.note_id)}
              className="w-full rounded-lg border border-white/[0.04] bg-neutral-800/30 px-2.5 py-1.5 text-left transition-colors hover:bg-neutral-800/60"
            >
              <p className="line-clamp-2 text-[12px] leading-snug text-neutral-400">
                {card.content}
              </p>
            </button>
          ))}
        </div>
      )}

      {!collapsed && cards.length === 0 && (
        <p className={`px-3 pb-2.5 text-[11px] transition-colors ${isOver ? "text-neutral-500" : "text-neutral-800"}`}>
          Drop here
        </p>
      )}
    </div>
  );
}

// ── Tracking tray (draggable cards, droppable) ────────────────────────────────

function TrackingTray({
  cards,
  collapsed,
  onToggle,
  onOpen,
  total,
  onCardDrop,
  weekEndDay,
}: {
  cards: BucketedNote[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (noteId: string) => void;
  total: number;
  onCardDrop: (noteId: string, targetBucket: string, newDate: string | null) => void;
  weekEndDay: WeekEndDay;
}) {
  // weekEndDay kept in props for future use (drag from tray to column)
  void weekEndDay;
  const { setNodeRef, isOver } = useDroppable({ id: "tracking" });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border transition-all duration-300 ${
        isOver ? "border-white/[0.12]" : "border-white/[0.05]"
      }`}
      style={{
        background: isOver
          ? "radial-gradient(ellipse at 50% 110%, #6366f11c 0%, transparent 55%), #13151f"
          : "#13151f",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500/70" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Tracking
        </span>
        <span className="text-[11px] text-neutral-700">{total || ""}</span>
        <span className="text-[10px] text-neutral-700 ml-1">· no due date</span>
        <span className="ml-auto text-[10px] text-neutral-700">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className="px-2 pb-2">
          {cards.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {cards.map((card) => (
                <DraggableCard key={card.note_id} card={card} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <p className={`px-1 pb-1.5 text-[11px] transition-colors ${isOver ? "text-neutral-500" : "text-neutral-800"}`}>
              Drop here to unschedule
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Draggable card wrapper ────────────────────────────────────────────────────

function DraggableCard({
  card,
  onOpen,
}: {
  card: BucketedNote;
  onOpen: (noteId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.note_id,
    data: { card },
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`touch-none transition-opacity duration-150 ${isDragging ? "opacity-20 scale-95" : ""}`}
      {...listeners}
      {...attributes}
    >
      <ActionCardItem card={card} onOpen={onOpen} />
    </div>
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
  onQuickAction,
  onCheckWaiting,
  checkWaitingBusy,
}: {
  filters: ViewFilters;
  savedViews: SavedView[];
  activeViewId: string | null;
  allCategories: string[];
  onFiltersChange: (f: ViewFilters) => void;
  onSaveView: (name: string) => void;
  onLoadView: (view: SavedView) => void;
  onDeleteView: (viewId: string) => void;
  onQuickAction: () => void;
  onCheckWaiting?: () => void;
  checkWaitingBusy?: boolean;
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
      {/* ── Quick Action ── */}
      <button
        type="button"
        onClick={onQuickAction}
        className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500"
      >
        + Quick Action
      </button>

      {/* ── Check Waiting ── */}
      {onCheckWaiting && (
        <button
          type="button"
          onClick={onCheckWaiting}
          disabled={checkWaitingBusy}
          className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200 disabled:opacity-50"
        >
          {checkWaitingBusy ? "Checking…" : "Check Waiting"}
        </button>
      )}

      <span className="h-4 w-px bg-white/[0.06]" />

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
                  onClick={() => { onLoadView(v); setViewDropOpen(false); }}
                  className={`flex-1 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.04] ${
                    activeViewId === v.id ? "text-indigo-300" : "text-neutral-400"
                  }`}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => { onDeleteView(v.id); setViewDropOpen(false); }}
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
          onClick={() => { setSavingView(true); setTimeout(() => saveInputRef.current?.focus(), 0); }}
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
                  onClick={() => { onFiltersChange({ ...filters, categories: [] }); setCatOpen(false); }}
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
        onChange={(e) => onFiltersChange({ ...filters, dueFilter: e.target.value as ViewFilters["dueFilter"] })}
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
        onChange={(e) => onFiltersChange({ ...filters, sort: e.target.value as ViewFilters["sort"] })}
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

// ── Flagged group ─────────────────────────────────────────────────────────────

function FlaggedGroup({
  id,
  label,
  cards,
  collapsed,
  onToggle,
  onOpen,
}: {
  id: string;
  label: string;
  cards: BucketedNote[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (noteId: string) => void;
}) {
  const isGeneral = id === "general";
  return (
    <div className="rounded-xl border border-white/[0.05] bg-neutral-900/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
            isGeneral ? "bg-neutral-600" : "bg-violet-400"
          }`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          {label}
        </span>
        <span className="text-[11px] text-neutral-600">{cards.length}</span>
        <span className="ml-auto text-[10px] text-neutral-700">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <ul className="space-y-1.5 px-2 pb-2">
          {cards.map((card) => (
            <ActionCardItem key={card.note_id} card={card} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Card item ─────────────────────────────────────────────────────────────────

function ActionCardItem({
  card,
  onOpen,
  showState,
}: {
  card: BucketedNote;
  onOpen: (noteId: string) => void;
  showState?: ActionState;
}) {
  const { awarenessMap } = useActions();

  const STATE_CLASS: Record<ActionState, string> = {
    needs_action: "bg-orange-950/60 text-orange-400",
    waiting: "bg-sky-950/60 text-sky-400",
    done: "bg-emerald-950/60 text-emerald-400",
  };
  const STATE_LABELS: Record<ActionState, string> = {
    needs_action: "Action",
    waiting: "Waiting",
    done: "Done",
  };

  const awareness = awarenessMap[card.note_id];
  const isUnseen = Boolean(
    card.updated_at &&
    (!awareness || awareness.last_viewed_at === null || card.updated_at > awareness.last_viewed_at),
  );

  const timedLabel =
    card.action_state === "needs_action" ? timedLabelForDueDate(card.due_date) : null;

  const displayIsRecent = card.updated_at ? isWithin24h(card.updated_at) : false;

  return (
    <li
      onClick={() => onOpen(card.note_id)}
      className="relative cursor-pointer rounded-xl border border-white/[0.06] bg-gradient-to-b from-neutral-800/70 to-neutral-900/80 p-3 transition-all duration-150 ease-out hover:border-white/[0.11] hover:from-neutral-800/90 hover:to-neutral-900 hover:-translate-y-px hover:shadow-md hover:shadow-black/30"
    >
      {isUnseen && (
        <span
          className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50"
          aria-label="Updated since last view"
        />
      )}

      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 line-clamp-3 whitespace-pre-wrap text-sm leading-tight text-neutral-100">
          {card.content}
        </p>
        {card.is_inbox && (
          <span className="flex-shrink-0 rounded-full bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-500">
            Inbox
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {showState && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATE_CLASS[showState]}`}>
            {STATE_LABELS[showState]}
          </span>
        )}

        {timedLabel && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${timedLabel.badgeClass}`}>
            {timedLabel.label}
          </span>
        )}
        {card.action_state === "done" && card.due_date && (
          <span className="rounded-full bg-neutral-800/60 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
            Was due {formatActionDate(card.due_date)}
          </span>
        )}

        {card.action_mode !== "flagged" && card.private_tags.length > 0 && (
          <>
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
          </>
        )}

        {card.updated_at && (
          <span className={`text-[10px] ${displayIsRecent ? "font-medium text-emerald-600" : "text-neutral-700"}`}>
            {relativeTimeShort(card.updated_at)}
          </span>
        )}
      </div>
    </li>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatActionDate(dateStr: string): string | null {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
