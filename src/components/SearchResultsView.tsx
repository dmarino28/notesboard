"use client";

import type { SearchResponse, SearchFilters, SearchCard } from "@/lib/search";
import type { BoardRow } from "@/lib/boards";
import type { AwarenessMap } from "@/lib/awareness";
import { timedLabelForDueDate, relativeTimeShort, isWithin24h } from "@/lib/dateUtils";
import { STATUS_META } from "@/lib/collab";
import type { NoteStatus } from "@/lib/collab";

type Props = {
  query: string;
  results: SearchResponse | null;
  isSearching: boolean;
  filters: SearchFilters;
  boards: BoardRow[];
  awarenessMap: AwarenessMap;
  onFilterChange: (f: SearchFilters) => void;
  onOpenCard: (noteId: string) => void;
};

export function SearchResultsView({
  query,
  results,
  isSearching,
  filters,
  boards,
  awarenessMap,
  onFilterChange,
  onOpenCard,
}: Props) {
  // Derive unique columns from current results for the column filter
  type ColOption = { id: string; name: string };
  const columnOptions: ColOption[] = [];
  if (results) {
    const seen = new Set<string>();
    for (const group of results.groups) {
      // If board filter is active, only include columns from that board
      if (filters.boardId && group.board?.id !== filters.boardId) continue;
      for (const v of group.verticals) {
        if (v.column && !seen.has(v.column.id)) {
          seen.add(v.column.id);
          columnOptions.push(v.column);
        }
      }
    }
    columnOptions.sort((a, b) => a.name.localeCompare(b.name));
  }

  const totalCards = results
    ? results.groups.reduce(
        (sum, g) => sum + g.verticals.reduce((s, v) => s + v.cards.length, 0),
        0,
      )
    : 0;

  const hasFilters = Boolean(filters.boardId || filters.columnId);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Filter bar ── */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
        {/* Board filter */}
        <select
          value={filters.boardId ?? ""}
          onChange={(e) => {
            const boardId = e.target.value || undefined;
            // Clear column filter when board changes
            onFilterChange({ boardId, columnId: undefined });
          }}
          className="cursor-pointer rounded-full border border-white/[0.08] bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:border-white/[0.14] hover:text-neutral-200 focus:outline-none"
        >
          <option value="">All Boards</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {/* List/Column filter — only meaningful when board is selected or results exist */}
        {columnOptions.length > 0 && (
          <select
            value={filters.columnId ?? ""}
            onChange={(e) => onFilterChange({ ...filters, columnId: e.target.value || undefined })}
            className="cursor-pointer rounded-full border border-white/[0.08] bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:border-white/[0.14] hover:text-neutral-200 focus:outline-none"
          >
            <option value="">All Lists</option>
            {columnOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <button
            type="button"
            onClick={() => onFilterChange({})}
            className="rounded-full border border-white/[0.06] px-2.5 py-1 text-[11px] text-neutral-600 transition-colors hover:border-white/[0.10] hover:text-neutral-400"
          >
            Clear
          </button>
        )}

        {/* Result count / searching indicator */}
        <span className="ml-auto text-[11px] text-neutral-600">
          {isSearching
            ? "Searching…"
            : results
            ? `${totalCards} result${totalCards === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>

      {/* ── Results body ── */}
      <div className="min-h-0 flex-1 overflow-y-auto nb-scroll px-4 py-4">
        {isSearching && !results && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-neutral-600">Searching…</p>
          </div>
        )}

        {!isSearching && results && totalCards === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-neutral-600">No results for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {results && totalCards > 0 && (
          <div className="space-y-8">
            {results.groups.map((group, gi) => {
              const boardName = group.board?.name ?? "Inbox";
              const boardId = group.board?.id ?? "inbox";

              // Apply board filter (already filtered by API, but also filter client-side for column)
              const filteredVerticals = group.verticals.filter((v) => {
                if (filters.columnId && v.column?.id !== filters.columnId) return false;
                return true;
              });
              if (filteredVerticals.length === 0) return null;

              const groupCardCount = filteredVerticals.reduce((s, v) => s + v.cards.length, 0);

              return (
                <section key={boardId + gi}>
                  {/* Board header */}
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      {boardName}
                    </h2>
                    <span className="text-[11px] text-neutral-700">{groupCardCount}</span>
                  </div>

                  <div className="space-y-4">
                    {filteredVerticals.map((vertical, vi) => {
                      const columnName = vertical.column?.name ?? "Inbox";
                      const columnId = vertical.column?.id ?? "inbox-col";

                      return (
                        <div key={columnId + vi}>
                          {/* Column header */}
                          <div className="mb-2 flex items-center gap-1.5 pl-1">
                            <span className="text-[10px] text-neutral-600">{columnName}</span>
                            <span className="text-[10px] text-neutral-700">{vertical.cards.length}</span>
                          </div>

                          {/* Cards */}
                          <ul className="space-y-1.5">
                            {vertical.cards.map((card) => (
                              <SearchCardItem
                                key={card.note_id + (card.placement_id ?? "")}
                                card={card}
                                awarenessMap={awarenessMap}
                                onOpen={onOpenCard}
                              />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Individual search result card ─────────────────────────────────────────────

function SearchCardItem({
  card,
  awarenessMap,
  onOpen,
}: {
  card: SearchCard;
  awarenessMap: AwarenessMap;
  onOpen: (noteId: string) => void;
}) {
  const timedLabel = timedLabelForDueDate(card.due_date);

  const awareness = awarenessMap[card.note_id];
  const isUnseen = Boolean(
    card.updated_at &&
    (!awareness || awareness.last_viewed_at === null || card.updated_at > awareness.last_viewed_at),
  );

  const displayTime = card.updated_at ?? card.last_public_activity_at;
  const displayIsRecent = displayTime ? isWithin24h(displayTime) : false;

  // Title: description if present; otherwise first 60 chars of content
  const title = card.description
    ? card.description
    : card.content.slice(0, 60).trimEnd() + (card.content.length > 60 ? "…" : "");

  // Snippet: content body, shown only when description is present (avoids duplication)
  const snippet = card.description && card.content
    ? card.content.length > 100 ? card.content.slice(0, 100).trimEnd() + "…" : card.content
    : null;

  return (
    <li
      onClick={() => onOpen(card.note_id)}
      className="relative cursor-pointer rounded-xl border border-white/[0.07] bg-neutral-800/60 p-3 shadow-sm shadow-black/30 transition-all duration-150 ease-out hover:scale-[1.005] hover:border-white/[0.12] hover:bg-neutral-800/80 hover:shadow-md hover:shadow-black/40"
    >
      {/* Unseen dot */}
      {isUnseen && (
        <span
          className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50"
          aria-label="Updated since last view"
        />
      )}

      {/* Title (description) + optional content snippet */}
      <p className="text-sm font-medium leading-snug text-neutral-200 line-clamp-2">
        {title}
      </p>
      {snippet && (
        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-snug text-neutral-500 line-clamp-2">
          {snippet}
        </p>
      )}

      {/* Badges row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {card.status && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              STATUS_META[card.status as NoteStatus]?.badgeClass ?? "bg-neutral-800/60 text-neutral-500"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                STATUS_META[card.status as NoteStatus]?.dotClass ?? "bg-neutral-500"
              }`}
            />
            {STATUS_META[card.status as NoteStatus]?.label ?? card.status}
          </span>
        )}

        {timedLabel && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${timedLabel.badgeClass}`}
          >
            {timedLabel.label}
          </span>
        )}

        {/* Last updated */}
        {displayTime && (
          <span
            className={`text-[10px] ${
              displayIsRecent ? "font-medium text-emerald-600" : "text-neutral-700"
            }`}
          >
            {relativeTimeShort(displayTime)}
          </span>
        )}
      </div>
    </li>
  );
}
