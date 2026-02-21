"use client";

import { useEffect, useState } from "react";
import { type OutlookThread } from "@/lib/outlookContext";
import { listBoards, type BoardRow } from "@/lib/boards";
import { listColumns, type ColumnRow } from "@/lib/columns";
import { listPlacements, type PlacedNoteRow } from "@/lib/placements";
import { listEmailThreadNoteIds, upsertEmailThreadForNote } from "@/lib/emailThreads";
import { searchNotes } from "@/lib/noteSearch";

type Props = {
  onOpenCard: (noteId: string) => void;
  /** When set, the view is in "linking mode" — card clicks select instead of navigate. */
  linkingThread?: OutlookThread | null;
  /** Called after a successful link in linking mode. */
  onLinkCreated?: (noteId: string) => void;
  /** Called when the user cancels linking mode. */
  onCancelLinking?: () => void;
};

export function BoardBrowserView({
  onOpenCard,
  linkingThread,
  onLinkCreated,
  onCancelLinking,
}: Props) {
  const isLinking = Boolean(linkingThread);

  // ── Board / column / card state ───────────────────────────────────────────────
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [allCards, setAllCards] = useState<PlacedNoteRow[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [emailNoteIds, setEmailNoteIds] = useState<Set<string>>(new Set());
  const [boardsLoading, setBoardsLoading] = useState(true);

  // ── Search state ──────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; content: string }[] | null>(null);
  const [searching, setSearching] = useState(false);

  // ── Linking-mode selection ────────────────────────────────────────────────────
  const [selectedForLink, setSelectedForLink] = useState<string | null>(null);
  const [selectedCardContent, setSelectedCardContent] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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

  // ── Debounced search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      setSearchResults(await searchNotes(q));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Reset selection when entering / exiting linking mode ──────────────────────
  useEffect(() => {
    setSelectedForLink(null);
    setSelectedCardContent(null);
    setLinkError(null);
    setSearchQuery("");
    setSearchResults(null);
  }, [linkingThread?.conversationId]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleCardClick(noteId: string, content: string) {
    if (isLinking) {
      setSelectedForLink(noteId);
      setSelectedCardContent(content);
      setLinkError(null);
    } else {
      onOpenCard(noteId);
    }
  }

  async function handleLink() {
    if (!linkingThread || !selectedForLink) return;
    setLinking(true);
    setLinkError(null);
    try {
      const { error } = await upsertEmailThreadForNote({
        noteId: selectedForLink,
        provider: linkingThread.provider,
        conversationId: linkingThread.conversationId,
        messageId: linkingThread.messageId,
        webLink: linkingThread.webLink,
        subject: linkingThread.subject,
        mailbox: linkingThread.mailbox,
        lastActivityAt: new Date().toISOString(),
      });
      if (error) throw new Error(error);
      onLinkCreated?.(selectedForLink);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Unknown error");
      setLinking(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const columnCards = allCards.filter((c) => c.column_id === selectedColumnId);
  const isSearching = searchQuery.trim() !== "";
  // Add bottom padding to card list when CTA bar is visible so the last card isn't covered
  const cardListClass = `min-h-0 flex-1 overflow-y-auto p-3${isLinking && selectedForLink ? " pb-36" : ""}`;

  // ── Loading / empty guards ────────────────────────────────────────────────────
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

      {/* Linking mode banner */}
      {isLinking && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-amber-800/40 bg-amber-900/20 px-3 py-2">
          <p className="flex-1 text-xs font-medium text-amber-300">
            Select a card to link this email
          </p>
          <button
            type="button"
            onClick={onCancelLinking}
            className="flex-shrink-0 cursor-pointer rounded px-2 py-0.5 text-xs text-amber-500 hover:text-amber-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Board selector */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-white/8 bg-neutral-900/60 px-3 py-2">
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setSelectedBoardId(b.id)}
            className={`flex-shrink-0 cursor-pointer rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
              selectedBoardId === b.id
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Column tabs */}
      {columns.length > 0 && (
        <div className="flex flex-shrink-0 overflow-x-auto border-b border-white/8">
          {columns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedColumnId(c.id)}
              className={`flex-shrink-0 cursor-pointer border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
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

      {/* Search input */}
      <div className="flex-shrink-0 border-b border-white/8 px-3 py-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedForLink(null);
          }}
          placeholder="Search all cards…"
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
        />
      </div>

      {/* Card list — padding-bottom increases when CTA bar is visible */}
      <div className={cardListClass}>
        {isSearching ? (
          /* ── Search results ── */
          searching ? (
            <p className="text-xs text-neutral-600">Searching…</p>
          ) : !searchResults || searchResults.length === 0 ? (
            <p className="text-xs text-neutral-500">No cards found.</p>
          ) : (
            <ul className="space-y-2">
              {searchResults.map((note) => {
                const isSelected = selectedForLink === note.id;
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => handleCardClick(note.id, note.content)}
                      className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        isSelected
                          ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-200"
                          : "border-white/8 bg-neutral-900 text-neutral-200 hover:border-white/15 hover:bg-neutral-800"
                      }`}
                    >
                      <span className="line-clamp-2 leading-snug">{note.content}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          /* ── Browse results ── */
          cardsLoading ? (
            <p className="text-xs text-neutral-600">Loading cards…</p>
          ) : columns.length === 0 ? (
            <p className="text-xs text-neutral-500">No columns in this board.</p>
          ) : columnCards.length === 0 ? (
            <p className="text-xs text-neutral-500">No cards in this column.</p>
          ) : (
            <ul className="space-y-2">
              {columnCards.map((card) => {
                const isSelected = selectedForLink === card.note_id;
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => handleCardClick(card.note_id, card.content)}
                      className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-200"
                          : "border-white/8 bg-neutral-900 text-neutral-200 hover:border-white/15 hover:bg-neutral-800"
                      }`}
                    >
                      <p className="line-clamp-2 text-sm leading-snug">{card.content}</p>
                      {(emailNoteIds.has(card.note_id) || card.placement_count > 1) && (
                        <div className="mt-1 flex items-center gap-1.5">
                          {emailNoteIds.has(card.note_id) && (
                            <span className="text-[11px]" title="Has linked email thread">✉</span>
                          )}
                          {card.placement_count > 1 && (
                            <span className="text-[11px] text-neutral-500" title="On multiple boards">🔗</span>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>

      {/* Linking CTA bar — sticky bottom, shown when a card is selected in linking mode */}
      {isLinking && selectedForLink && (
        <div className="flex-shrink-0 space-y-2 border-t border-white/8 bg-neutral-950 p-3">
          <p className="line-clamp-1 text-xs text-neutral-400">
            {selectedCardContent || "(untitled)"}
          </p>
          {linkError && <p className="text-xs text-red-400">{linkError}</p>}
          <button
            type="button"
            onClick={handleLink}
            disabled={linking}
            className="w-full cursor-pointer rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {linking ? "Linking…" : "Link this email to this card"}
          </button>
        </div>
      )}

    </div>
  );
}
