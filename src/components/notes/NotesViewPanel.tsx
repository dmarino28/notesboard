"use client";

import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { ViewMode } from "@/lib/noteViews";
import {
  viewAllEntries,
  viewByFilm,
  viewByDay,
  viewByMarket,
  viewByCampaignSignals,
  filterEntriesByQuery,
} from "@/lib/noteViews";
import { NoteEntryRow } from "./NoteEntryRow";

type SharedProps = {
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
};

type Props = SharedProps & {
  view: ViewMode;
  searchQuery: string;
};

export function NotesViewPanel({ view, searchQuery, entries, boards, ...rest }: Props) {
  const filtered = filterEntriesByQuery(entries, searchQuery);

  function listOf(ents: NoteEntryWithSignals[]) {
    return <FlatEntryList entries={ents} boards={boards} {...rest} />;
  }

  if (view === "all") {
    return listOf(viewAllEntries(filtered));
  }

  if (view === "film") {
    const groups = viewByFilm(filtered, boards);
    if (groups.length === 0) return <EmptyState message="No notes with board context yet." />;
    return (
      <div className="space-y-6">
        {groups.map((g) => (
          <GroupSection key={g.boardId ?? "unknown"} label={g.boardName} count={g.entries.length}>
            {listOf(g.entries)}
          </GroupSection>
        ))}
      </div>
    );
  }

  if (view === "daily") {
    const groups = viewByDay(filtered);
    if (groups.length === 0) return <EmptyState message="No notes found." />;
    return (
      <div className="space-y-6">
        {groups.map((g) => (
          <GroupSection key={g.date} label={g.label} count={g.entries.length}>
            {listOf(g.entries)}
          </GroupSection>
        ))}
      </div>
    );
  }

  if (view === "market") {
    const groups = viewByMarket(filtered);
    if (groups.length === 0) return <EmptyState message="No entries with market mentions." />;
    return (
      <div className="space-y-6">
        {groups.map((g) => (
          <GroupSection key={g.market} label={g.market} count={g.entries.length}>
            {listOf(g.entries)}
          </GroupSection>
        ))}
      </div>
    );
  }

  if (view === "signals") {
    const signalEntries = viewByCampaignSignals(filtered);
    if (signalEntries.length === 0) return <EmptyState message="No entries with campaign signals." />;
    return listOf(signalEntries);
  }

  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type FlatListProps = Omit<SharedProps, "entries"> & { entries: NoteEntryWithSignals[] };

function FlatEntryList({ entries, boards, focusedId, selectedIds, onFocus, onBlur, onChange, onEnter, onBackspace, onIndent, onArrow, onSelect }: FlatListProps) {
  return (
    <div className="space-y-0.5">
      {entries.map((entry) => (
        <NoteEntryRow
          key={entry.id}
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
          onArrow={onArrow}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function GroupSection({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{count}</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-gray-400">{message}</div>
  );
}
