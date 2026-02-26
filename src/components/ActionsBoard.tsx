"use client";

// ActionsBoard — two-section list view for personal action items.
// Timed section: cards bucketed by urgency (overdue / today / tomorrow / this week / later / waiting / done).
// Flagged section: cards grouped by tag-def groups + General (untagged).

import { useRef, useState } from "react";
import type {
  BucketedNote,
  ActionState,
  ViewFilters,
  SavedView,
  MyActionsResult,
  TagDef,
} from "@/lib/userActions";
import { DEFAULT_FILTERS } from "@/lib/userActions";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  result: MyActionsResult;
  tagDefs: TagDef[];
  allCategories: string[];
  filters: ViewFilters;
  savedViews: SavedView[];
  activeViewId: string | null;
  onOpenCard: (noteId: string) => void;
  onFiltersChange: (f: ViewFilters) => void;
  onSaveView: (name: string) => void;
  onLoadView: (view: SavedView) => void;
  onDeleteView: (viewId: string) => void;
  onQuickAction: () => void;
  onManageGroups: () => void;
  onCheckWaiting?: () => void;
  checkWaitingBusy?: boolean;
};

// ── Timed bucket metadata ──────────────────────────────────────────────────────

type TimedBucket = {
  key: keyof MyActionsResult;
  label: string;
  dotClass: string;
  defaultCollapsed: boolean;
};

const TIMED_BUCKETS: TimedBucket[] = [
  { key: "overdue",   label: "Overdue",    dotClass: "bg-red-400",     defaultCollapsed: false },
  { key: "today",     label: "Today",      dotClass: "bg-orange-400",  defaultCollapsed: false },
  { key: "tomorrow",  label: "Tomorrow",   dotClass: "bg-amber-400",   defaultCollapsed: false },
  { key: "this_week", label: "This Week",  dotClass: "bg-sky-400",     defaultCollapsed: false },
  { key: "beyond",    label: "Later",      dotClass: "bg-neutral-500", defaultCollapsed: false },
  { key: "waiting",   label: "Waiting",    dotClass: "bg-purple-400",  defaultCollapsed: false },
  { key: "done",      label: "Done",       dotClass: "bg-emerald-400", defaultCollapsed: true  },
];

// ── Main component ─────────────────────────────────────────────────────────────

export function ActionsBoard({
  result,
  tagDefs,
  allCategories,
  filters,
  savedViews,
  activeViewId,
  onOpenCard,
  onFiltersChange,
  onSaveView,
  onLoadView,
  onDeleteView,
  onQuickAction,
  onManageGroups,
  onCheckWaiting,
  checkWaitingBusy = false,
}: Props) {
  const defaultCollapsed = new Set(
    TIMED_BUCKETS.filter((b) => b.defaultCollapsed).map((b) => b.key as string),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(defaultCollapsed);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Sort cards within a timed bucket
  function sortCards(cards: BucketedNote[]): BucketedNote[] {
    if (filters.sort === "due_asc") {
      return [...cards].sort((a, b) => {
        if (a.effective_due_date && b.effective_due_date)
          return a.effective_due_date.localeCompare(b.effective_due_date);
        if (a.effective_due_date) return -1;
        if (b.effective_due_date) return 1;
        return a.note_id.localeCompare(b.note_id);
      });
    }
    return [...cards].sort((a, b) => a.note_id.localeCompare(b.note_id));
  }

  // Compute flagged groups from tagDefs + result.flagged
  const sortedDefs = [...tagDefs].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  // Group flagged cards: each card can appear in multiple groups
  const flaggedGroups: Array<{ id: string; label: string; cards: BucketedNote[] }> = [];
  for (const def of sortedDefs) {
    flaggedGroups.push({
      id: def.id,
      label: def.name,
      cards: result.flagged.filter((c) => c.private_tags.includes(def.name)),
    });
  }
  // General = flagged cards with no private_tag matching any tagDef name
  const defNames = new Set(sortedDefs.map((d) => d.name));
  const generalCards = result.flagged.filter(
    (c) => c.private_tags.length === 0 || !c.private_tags.some((t) => defNames.has(t)),
  );
  flaggedGroups.push({ id: "general", label: "General", cards: generalCards });

  const timedTotal = TIMED_BUCKETS.reduce((n, b) => n + result[b.key].length, 0);
  const flaggedTotal = result.flagged.length;

  return (
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
        onQuickAction={onQuickAction}
        onCheckWaiting={onCheckWaiting}
        checkWaitingBusy={checkWaitingBusy}
      />

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 nb-scroll">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* ── Timed section ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Timed
              </h2>
              <span className="text-[11px] text-neutral-700">{timedTotal}</span>
            </div>

            <div className="space-y-2">
              {TIMED_BUCKETS.map((bucket) => {
                const cards = sortCards(result[bucket.key] as BucketedNote[]);
                if (cards.length === 0) return null;
                const isCollapsed = collapsed.has(bucket.key as string);
                return (
                  <TimedGroup
                    key={bucket.key}
                    bucket={bucket}
                    cards={cards}
                    collapsed={isCollapsed}
                    onToggle={() => toggle(bucket.key as string)}
                    onOpen={onOpenCard}
                  />
                );
              })}

              {timedTotal === 0 && (
                <p className="py-4 text-center text-sm text-neutral-700">
                  No timed actions.
                </p>
              )}
            </div>
          </section>

          {/* ── Flagged section ── */}
          <section>
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
          </section>
        </div>
      </div>
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
              if (e.key === "Escape") {
                setSavingView(false);
                setNewViewName("");
              }
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
            onClick={() => {
              setSavingView(false);
              setNewViewName("");
            }}
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

// ── Timed group ───────────────────────────────────────────────────────────────

function TimedGroup({
  bucket,
  cards,
  collapsed,
  onToggle,
  onOpen,
}: {
  bucket: TimedBucket;
  cards: BucketedNote[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (noteId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-neutral-900/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${bucket.dotClass}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          {bucket.label}
        </span>
        <span className="text-[11px] text-neutral-600">{cards.length}</span>
        <span className="ml-auto text-[10px] text-neutral-700">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {!collapsed && (
        <ul className="space-y-1.5 px-2 pb-2">
          {cards.map((card) => (
            <ActionCardItem
              key={card.note_id}
              card={card}
              onOpen={onOpen}
              showState={
                bucket.key === "waiting" || bucket.key === "done"
                  ? (bucket.key as ActionState)
                  : undefined
              }
            />
          ))}
        </ul>
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
        <span className="ml-auto text-[10px] text-neutral-700">
          {collapsed ? "▸" : "▾"}
        </span>
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
  const STATE_LABELS: Record<ActionState, string> = {
    needs_action: "Needs Action",
    waiting: "Waiting",
    done: "Done",
  };
  const STATE_CLASS: Record<ActionState, string> = {
    needs_action: "bg-orange-950/60 text-orange-400",
    waiting: "bg-sky-950/60 text-sky-400",
    done: "bg-emerald-950/60 text-emerald-400",
  };

  return (
    <li
      onClick={() => onOpen(card.note_id)}
      className="cursor-pointer rounded-xl border border-white/[0.07] bg-neutral-800/60 p-3 shadow-sm shadow-black/30 transition-all duration-200 ease-out hover:scale-[1.005] hover:border-white/[0.12] hover:bg-neutral-800/80 hover:shadow-md hover:shadow-black/45"
    >
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
        {/* State badge (shown in waiting/done buckets for clarity) */}
        {showState && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATE_CLASS[showState]}`}>
            {STATE_LABELS[showState]}
          </span>
        )}

        {/* Due date badge */}
        {card.effective_due_date && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isOverdue(card.effective_due_date) && card.action_state !== "done"
                ? "bg-red-950/60 text-red-400"
                : "bg-neutral-800/60 text-neutral-500"
            }`}
          >
            {card.action_state === "done" ? "Was due" : "Due"}{" "}
            {formatActionDate(card.effective_due_date)}
            {card.personal_due_date ? " (personal)" : ""}
          </span>
        )}

        {/* Private tags (timed mode) — up to 2 shown */}
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
      </div>
    </li>
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
  return !isNaN(d.getTime()) && d < new Date(new Date().toDateString());
}
