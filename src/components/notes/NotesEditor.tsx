"use client";

import { Fragment, useCallback } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { AliasMap } from "@/lib/noteAliases";
import { NoteEntryRow } from "./NoteEntryRow";
import { viewByDay } from "@/lib/noteViews";
import { resolveBoardHex } from "./ContextBadge";

type Props = {
  entries: NoteEntryWithSignals[];
  boards: BoardRow[];
  focusedId: string | null;
  selectedIds: Set<string>;
  onFocus: (id: string) => void;
  onBlur: (id: string, content: string) => void;
  onChange: (id: string, content: string) => void;
  onEnter: (id: string, cursorPos: number) => void;
  onBackspace: (id: string, isEmpty: boolean) => void;
  onIndent: (id: string, direction: "in" | "out") => void;
  onArrow: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
  onAddFirstEntry: () => void;
  onOrganize?: () => void;
  userAliases?: AliasMap;
  onConfirmAlias?: (alias: string, boardId: string) => void;
};

export function NotesEditor({
  entries,
  boards,
  focusedId,
  selectedIds,
  onFocus,
  onBlur,
  onChange,
  onEnter,
  onBackspace,
  onIndent,
  onArrow,
  onSelect,
  onAddFirstEntry,
  onOrganize,
  userAliases,
  onConfirmAlias,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const dayGroups = viewByDay(entries);

  const handleArrow = useCallback(
    (id: string, direction: "up" | "down") => {
      onArrow(id, direction);
    },
    [onArrow]
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mb-1 text-sm font-medium text-gray-500">Start capturing</p>
        <p className="mb-6 text-xs text-gray-400">Type notes, bullets, campaign signals, meeting notes...</p>
        <button
          type="button"
          onClick={onAddFirstEntry}
          className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          + New note entry
        </button>
      </div>
    );
  }

  // Precompute context headers: show a board header when context changes between entries.
  // lastBoardId resets at each day group so each day's first context section is always labeled.
  return (
    <div className="space-y-5">
      {dayGroups.map((group) => {
        const isToday = group.date === today;
        let lastBoardId: string | null = null;
        // Track how many entries ago we last showed a header for each board.
        // A header only re-appears for the same board after a gap of ≥4 entries,
        // preventing visual noise when boards alternate frequently.
        const lastHeaderIdxForBoard = new Map<string, number>();

        const rowsWithHeaders = group.entries.map((entry, idx) => {
          const resolvedId = entry.explicit_board_id ?? entry.inferred_board_id ?? null;
          const boardChanged = resolvedId !== null && resolvedId !== lastBoardId;
          const lastHeaderIdx = resolvedId
            ? (lastHeaderIdxForBoard.get(resolvedId) ?? -Infinity)
            : -Infinity;
          const showHeader = boardChanged && idx - lastHeaderIdx >= 4;
          if (resolvedId !== null) lastBoardId = resolvedId;
          if (showHeader && resolvedId) lastHeaderIdxForBoard.set(resolvedId, idx);
          return { entry, showHeader, resolvedId };
        });

        return (
          <div key={group.date}>
            {/* Date section header */}
            <div className="mb-1.5 flex items-center gap-2">
              <span className={`text-xs font-semibold ${isToday ? "text-indigo-600" : "text-gray-400"}`}>
                {group.label}
              </span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>

            {/* Entries with context headers */}
            <div className="space-y-0">
              {rowsWithHeaders.map(({ entry, showHeader, resolvedId }) => (
                <Fragment key={entry.id}>
                  {showHeader && resolvedId && (
                    <ContextSectionHeader boardId={resolvedId} boards={boards} />
                  )}
                  <NoteEntryRow
                    entry={entry}
                    boards={boards}
                    isFocused={focusedId === entry.id}
                    isSelected={selectedIds.has(entry.id)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onChange={onChange}
                    onEnter={onEnter}
                    onBackspace={onBackspace}
                    onIndent={onIndent}
                    onArrow={handleArrow}
                    onSelect={onSelect}
                    onOrganize={onOrganize}
                    userAliases={userAliases}
                    onConfirmAlias={onConfirmAlias}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        );
      })}

      {/* Indent hint — subtle, visible when at least one entry is indented */}
      {entries.some((e) => e.indent_level > 0) && (
        <p className="mt-3 text-center text-[10px] text-gray-300 select-none">
          Tab to indent · Shift+Tab to unindent
        </p>
      )}
    </div>
  );
}

// ─── Context section header ────────────────────────────────────────────────────

function ContextSectionHeader({
  boardId,
  boards,
}: {
  boardId: string;
  boards: BoardRow[];
}) {
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  const hex = resolveBoardHex(boardId, boards) ?? "#6366f1";

  return (
    <div className="flex items-center gap-2.5 pb-1.5 pt-3">
      <span
        className="text-[11px] font-semibold tracking-wide"
        style={{ color: hex }}
      >
        {board.name}
      </span>
      <div
        className="h-px flex-1"
        style={{ backgroundColor: `${hex}2e` }}
      />
    </div>
  );
}
