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
      // Normalize: if all boards selected, treat as "all" (empty)
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
    <div className="mb-4 space-y-2.5 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
      {/* Row 1: Boards + Labels + Type */}
      <div className="flex flex-wrap gap-4">
        {/* Boards */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-neutral-500">Boards</span>
          <button
            onClick={() => patch({ boardIds: [] })}
            className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
              allBoards
                ? "bg-neutral-200 text-neutral-900 font-medium"
                : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            All
          </button>
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => toggleBoard(board.id)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                isBoardOn(board.id)
                  ? "bg-blue-700 text-white font-medium"
                  : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {board.name}
            </button>
          ))}
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Labels</span>
            {labels.map((label) => {
              const on = filters.labelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  onClick={() => toggleLabel(label.id)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium text-white transition-opacity ${
                    on ? "opacity-100 ring-2 ring-white/30" : "opacity-40 hover:opacity-65"
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
          <span className="text-xs font-medium text-neutral-500">Type</span>
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
              className={`rounded px-2.5 py-0.5 text-xs transition-colors ${
                filters.type === v
                  ? "bg-neutral-100 text-neutral-900 font-medium"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Time-state toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-neutral-500">Due:</span>
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
            className={`rounded border px-2 py-0.5 text-xs transition-colors ${
              filters.timeState[key]
                ? "border-amber-500 bg-amber-900/40 text-amber-300"
                : "border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}

        <span className="ml-2 text-xs font-medium text-neutral-500">Events:</span>
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
            className={`rounded border px-2 py-0.5 text-xs transition-colors ${
              filters.timeState[key]
                ? "border-indigo-500 bg-indigo-900/40 text-indigo-300"
                : "border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
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
          className={`rounded border px-2 py-0.5 text-xs transition-colors ${
            filters.showArchived
              ? "border-neutral-500 text-neutral-200"
              : "border-neutral-700 text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {filters.showArchived ? "Showing archived" : "Show archived"}
        </button>

        {hasActiveFilters && (
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="text-xs text-neutral-500 underline hover:text-neutral-300"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-neutral-500">
          {shownCount === totalCount
            ? `${shownCount} items`
            : `${shownCount} / ${totalCount} shown`}
        </span>
      </div>
    </div>
  );
}
