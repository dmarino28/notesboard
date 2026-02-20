"use client";

import { useEffect, useState } from "react";
import { listBoards, type BoardRow } from "@/lib/boards";
import { listColumns, type ColumnRow } from "@/lib/columns";
import { listPlacements, type PlacedNoteRow } from "@/lib/placements";
import { listEmailThreadNoteIds } from "@/lib/emailThreads";

type Props = {
  onOpenCard: (noteId: string) => void;
};

export function BoardBrowserView({ onOpenCard }: Props) {
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [allCards, setAllCards] = useState<PlacedNoteRow[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [emailNoteIds, setEmailNoteIds] = useState<Set<string>>(new Set());
  const [boardsLoading, setBoardsLoading] = useState(true);

  // ── Init: load boards ─────────────────────────────────────────────────────────
  useEffect(() => {
    listBoards().then(({ data }) => {
      if (data?.length) {
        const sorted = [
          ...data.filter((b) => b.name === "Landing Pad"),
          ...data.filter((b) => b.name !== "Landing Pad"),
        ];
        setBoards(sorted);
        setSelectedBoardId(sorted[0].id);
      }
      setBoardsLoading(false);
    });
  }, []);

  // ── Load columns + cards when board changes ───────────────────────────────────
  useEffect(() => {
    if (!selectedBoardId) return;
    setCardsLoading(true);
    setAllCards([]);
    setColumns([]);
    setSelectedColumnId("");
    setEmailNoteIds(new Set());

    Promise.all([
      listColumns(selectedBoardId),
      listPlacements(selectedBoardId),
    ]).then(([colResult, cardResult]) => {
      const cols = colResult.data ?? [];
      setColumns(cols);
      if (cols.length > 0) setSelectedColumnId(cols[0].id);

      const cards = cardResult.data ?? [];
      setAllCards(cards);
      setCardsLoading(false);

      if (cards.length > 0) {
        const noteIds = cards.map((c) => c.note_id);
        listEmailThreadNoteIds(noteIds).then(setEmailNoteIds);
      }
    });
  }, [selectedBoardId]);

  // Derived: cards for the active column
  const columnCards = allCards.filter((c) => c.column_id === selectedColumnId);

  if (boardsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-neutral-600">Loading boards…</p>
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-neutral-500">No boards yet.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">

      {/* Level 1 — Board selector */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-white/8 bg-neutral-900/60 px-3 py-2">
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedBoardId(b.id)}
            className={`flex-shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedBoardId === b.id
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Level 2 — Column tabs */}
      {columns.length > 0 && (
        <div className="flex flex-shrink-0 overflow-x-auto border-b border-white/8">
          {columns.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedColumnId(c.id)}
              className={`flex-shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                selectedColumnId === c.id
                  ? "border-indigo-500 text-indigo-300"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Level 3 — Card list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {cardsLoading ? (
          <p className="text-xs text-neutral-600">Loading cards…</p>
        ) : columns.length === 0 ? (
          <p className="text-xs text-neutral-500">No columns in this board.</p>
        ) : columnCards.length === 0 ? (
          <p className="text-xs text-neutral-500">No cards in this column.</p>
        ) : (
          <ul className="space-y-2">
            {columnCards.map((card) => (
              <li key={card.id}>
                <button
                  onClick={() => onOpenCard(card.note_id)}
                  className="w-full rounded-lg border border-white/8 bg-neutral-900 px-3 py-2.5 text-left transition-colors hover:border-white/15 hover:bg-neutral-800 active:bg-neutral-700"
                >
                  <p className="line-clamp-2 text-sm leading-snug text-neutral-200">
                    {card.content}
                  </p>
                  {(emailNoteIds.has(card.note_id) || card.placement_count > 1) && (
                    <div className="mt-1 flex items-center gap-1.5">
                      {emailNoteIds.has(card.note_id) && (
                        <span className="text-[11px]" title="Has linked email thread">✉</span>
                      )}
                      {card.placement_count > 1 && (
                        <span className="text-[11px] text-neutral-500" title="On multiple boards">
                          🔗
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
