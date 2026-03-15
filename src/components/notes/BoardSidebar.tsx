"use client";

import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";

type Props = {
  boards: BoardRow[];
  entries: NoteEntryWithSignals[];
  selected: string; // "quick" | "all" | boardId
  onSelect: (filter: string) => void;
};

export function BoardSidebar({ boards, entries, selected, onSelect }: Props) {
  const activeEntries = entries.filter((e) => e.status === "active");

  // Count entries with no explicit board routing (Quick Notes).
  // Matches the Phase 1 filter: inferred_board_id is deprecated for visibility.
  const quickCount = activeEntries.filter((e) => !e.explicit_board_id).length;

  // Count entries per board — only explicit routing counts.
  const boardCounts = new Map<string, number>();
  for (const e of activeEntries) {
    if (e.explicit_board_id) {
      boardCounts.set(e.explicit_board_id, (boardCounts.get(e.explicit_board_id) ?? 0) + 1);
    }
  }

  // Boards that have entries in the current set come first
  const boardsWithEntries = boards
    .filter((b) => boardCounts.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const boardsWithout = boards
    .filter((b) => !boardCounts.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <aside className="flex w-44 flex-shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-white">
      <div className="space-y-px p-2 pt-3">

        {/* Quick Notes — primary capture inbox */}
        <SidebarItem
          label="Quick Notes"
          count={quickCount}
          selected={selected === "quick"}
          onClick={() => onSelect("quick")}
          accent
        />

        {/* Active boards — those with entries in the current loaded set */}
        {boardsWithEntries.length > 0 && (
          <>
            <div className="mx-1 my-1.5 h-px bg-gray-100" />
            {boardsWithEntries.map((board) => (
              <SidebarItem
                key={board.id}
                label={board.name}
                count={boardCounts.get(board.id) ?? 0}
                selected={selected === board.id}
                onClick={() => onSelect(board.id)}
              />
            ))}
          </>
        )}

        {/* Other boards — no entries yet, shown subdued */}
        {boardsWithout.length > 0 && (
          <>
            <div className="mx-1 my-1.5 h-px bg-gray-100" />
            {boardsWithout.map((board) => (
              <SidebarItem
                key={board.id}
                label={board.name}
                count={0}
                selected={selected === board.id}
                onClick={() => onSelect(board.id)}
                dim
              />
            ))}
          </>
        )}

        {/* All Notes — full chronological view */}
        <div className="mx-1 my-1.5 h-px bg-gray-100" />
        <SidebarItem
          label="All Notes"
          count={activeEntries.length}
          selected={selected === "all"}
          onClick={() => onSelect("all")}
        />
      </div>
    </aside>
  );
}

function SidebarItem({
  label,
  count,
  selected,
  onClick,
  accent = false,
  dim = false,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selected
          ? "bg-indigo-50 font-medium text-indigo-700"
          : dim
            ? "text-gray-400 hover:bg-gray-50 hover:text-gray-500"
            : accent
              ? "font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-800",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {count > 0 && (
        <span
          className={[
            "ml-1.5 flex-shrink-0 rounded-full px-1.5 py-px text-[10px] tabular-nums leading-none",
            selected
              ? "bg-indigo-100 text-indigo-600"
              : "bg-gray-100 text-gray-400",
          ].join(" ")}
        >
          {count}
        </span>
      )}
    </button>
  );
}
