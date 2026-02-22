"use client";

import { CalendarFilters, DEFAULT_FILTERS } from "@/lib/calendar";
import { BoardRow } from "@/lib/boards";
import { LabelRow } from "@/lib/labels";

type Props = {
  boards: BoardRow[];
  labels: LabelRow[];
  filters: CalendarFilters;
  onChange: (f: CalendarFilters) => void;
  shownCount: number;
  totalCount: number;
};

export function CalendarFilterBar({
  boards,
  labels,
  filters,
  onChange,
  shownCount,
  totalCount,
}: Props) {
  function patch(partial: Partial<CalendarFilters>) {
    onChange({ ...filters, ...partial });
  }

  function toggleBoard(id: string) {
    const cur = filters.boardIds;
    if (cur.includes(id)) {
      patch({ boardIds: cur.filter((b) => b !== id) });
    } else {
      const next = [...cur, id];
      patch({ boardIds: next.length === boards.length ? [] : next });
    }
  }

  function toggleLabel(id: string) {
    const cur = filters.labelIds;
    patch({
      labelIds: cur.includes(id) ? cur.filter((l) => l !== id) : [...cur, id],
    });
  }

  function toggleTime(key: keyof CalendarFilters["timeState"]) {
    patch({ timeState: { ...filters.timeState, [key]: !filters.timeState[key] } });
  }

  const allBoards = filters.boardIds.length === 0;
  const isBoardOn = (id: string) => filters.boardIds.includes(id);

  const hasActiveFilters =
    filters.boardIds.length > 0 ||
    filters.labelIds.length > 0 ||
    filters.type !== "both" ||
    Object.values(filters.timeState).some(Boolean) ||
    filters.showArchived;

  return (
    <div className="mb-4 space-y-2.5 rounded-xl border border-white/[0.07] bg-neutral-900/50 p-3 text-sm">
      {/* Row 1: Boards + Labels + Type */}
      <div className="flex flex-wrap gap-4">
        {/* Boards */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">
            Boards
          </span>
          <button
            onClick={() => patch({ boardIds: [] })}
            className={`rounded-full px-2.5 py-0.5 text-xs transition-colors duration-150 ${
              allBoards
                ? "bg-neutral-700 font-medium text-neutral-100"
                : "bg-white/[0.04] text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300"
            }`}
          >
            All
          </button>
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => toggleBoard(board.id)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors duration-150 ${
                isBoardOn(board.id)
                  ? "border border-indigo-500/25 bg-indigo-500/15 font-medium text-indigo-300"
                  : "bg-white/[0.04] text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300"
              }`}
            >
              {board.name}
            </button>
          ))}
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">
              Labels
            </span>
            {labels.map((label) => {
              const on = filters.labelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  onClick={() => toggleLabel(label.id)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium text-white transition-opacity duration-150 ${
                    on ? "opacity-100 ring-1 ring-white/25" : "opacity-35 hover:opacity-60"
                  }`}
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Type */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">
            Type
          </span>
          {(
            [
              { v: "both", label: "Both" },
              { v: "events", label: "Events" },
              { v: "due", label: "Due dates" },
            ] as { v: CalendarFilters["type"]; label: string }[]
          ).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => patch({ type: v })}
              className={`rounded-lg px-2.5 py-0.5 text-xs transition-colors duration-150 ${
                filters.type === v
                  ? "bg-neutral-700/80 font-medium text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Time-state toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">
          Due:
        </span>
        {(
          [
            { key: "overdue", label: "Overdue" },
            { key: "dueToday", label: "Today" },
            { key: "dueNext7", label: "Next 7 days" },
          ] as { key: keyof CalendarFilters["timeState"]; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleTime(key)}
            className={`rounded-lg border px-2 py-0.5 text-xs transition-colors duration-150 ${
              filters.timeState[key]
                ? "border-red-500/30 bg-red-950/40 text-red-300"
                : "border-white/[0.08] text-neutral-600 hover:border-white/[0.14] hover:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}

        <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-neutral-600">
          Events:
        </span>
        {(
          [
            { key: "happeningNow", label: "Happening now" },
            { key: "startingNext7", label: "Starting next 7d" },
            { key: "pastEvents", label: "Past" },
          ] as { key: keyof CalendarFilters["timeState"]; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleTime(key)}
            className={`rounded-lg border px-2 py-0.5 text-xs transition-colors duration-150 ${
              filters.timeState[key]
                ? "border-indigo-500/30 bg-indigo-950/40 text-indigo-300"
                : "border-white/[0.08] text-neutral-600 hover:border-white/[0.14] hover:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Row 3: Archived + Clear + Count */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => patch({ showArchived: !filters.showArchived })}
          className={`rounded-lg border px-2 py-0.5 text-xs transition-colors duration-150 ${
            filters.showArchived
              ? "border-white/[0.14] text-neutral-200"
              : "border-white/[0.08] text-neutral-600 hover:text-neutral-300"
          }`}
        >
          {filters.showArchived ? "Showing archived" : "Show archived"}
        </button>

        {hasActiveFilters && (
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="text-xs text-neutral-600 underline underline-offset-2 transition-colors hover:text-neutral-400"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-[11px] text-neutral-600">
          {shownCount === totalCount
            ? `${shownCount} items`
            : `${shownCount} / ${totalCount} shown`}
        </span>
      </div>
    </div>
  );
}
