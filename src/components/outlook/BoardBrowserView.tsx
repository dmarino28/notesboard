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
  linkingThread?: OutlookThread | null;
  onLinkCreated?: (noteId: string) => void;
  onCancelLinking?: () => void;
};

export function BoardBrowserView({
  onOpenCard,
  linkingThread,
  onLinkCreated,
  onCancelLinking,
}: Props) {
  const isLinking = Boolean(linkingThread);

  // ── Board / column / card ─────────────────────────────────────────────────────
  const [boards, setBoards]                   = useState<BoardRow[]>([]);
  const [columns, setColumns]                 = useState<ColumnRow[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [allCards, setAllCards]               = useState<PlacedNoteRow[]>([]);
  const [cardsLoading, setCardsLoading]       = useState(false);
  const [emailNoteIds, setEmailNoteIds]       = useState<Set<string>>(new Set());
  const [boardsLoading, setBoardsLoading]     = useState(true);

  // ── Search ────────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]         = useState("");
  const [searchResults, setSearchResults]     = useState<{ id: string; content: string }[] | null>(null);
  const [searching, setSearching]             = useState(false);

  // ── Linking selection ─────────────────────────────────────────────────────────
  const [selectedForLink, setSelectedForLink]         = useState<string | null>(null);
  const [selectedCardContent, setSelectedCardContent] = useState<string | null>(null);
  const [linking, setLinking]                         = useState(false);
  const [linkError, setLinkError]                     = useState<string | null>(null);

  // ── Load boards ───────────────────────────────────────────────────────────────
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
        listEmailThreadNoteIds(cards.map((c) => c.note_id)).then(setEmailNoteIds);
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

  // ── Reset selection on linking context change ─────────────────────────────────
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

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (boardsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-neutral-700">Loading boards…</p>
      </div>
    );
  }
  if (boards.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-neutral-500">No boards yet</p>
        <p className="text-xs text-neutral-700">Create a board in NotesBoard first.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">

      {/* Linking mode banner */}
      {isLinking && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-amber-800/30 bg-amber-950/30 px-3 py-2">
          <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
          <p className="flex-1 text-xs font-medium text-amber-300">
            Select a card to link this email
          </p>
          <button
            type="button"
            onClick={onCancelLinking}
            className="flex-shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-xs text-amber-500 transition-colors hover:text-amber-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Board selector — scrollable chip row */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-white/[0.07] px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setSelectedBoardId(b.id)}
            className={`flex-shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
              selectedBoardId === b.id
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-500 hover:bg-white/[0.05] hover:text-neutral-300"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Column tabs */}
      {columns.length > 0 && (
        <div className="flex flex-shrink-0 overflow-x-auto border-b border-white/[0.07] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {columns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedColumnId(c.id)}
              className={`flex-shrink-0 cursor-pointer border-b-2 px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                selectedColumnId === c.id
                  ? "border-indigo-500 text-indigo-300"
                  : "border-transparent text-neutral-600 hover:text-neutral-400"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex-shrink-0 border-b border-white/[0.07] px-3 py-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedForLink(null);
          }}
          placeholder="Search all cards…"
          className="w-full rounded-xl border border-white/[0.08] bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 outline-none placeholder:text-neutral-700 transition-colors focus:border-white/[0.16]"
        />
      </div>

      {/* Card list */}
      <div className={`nb-scroll min-h-0 flex-1 overflow-y-auto p-3${isLinking && selectedForLink ? " pb-36" : ""}`}>
        {isSearching ? (
          searching ? (
            <p className="pt-2 text-xs text-neutral-700">Searching…</p>
          ) : !searchResults || searchResults.length === 0 ? (
            <EmptyState>No cards found for "{searchQuery}"</EmptyState>
          ) : (
            <CardList
              items={searchResults.map((n) => ({ id: n.id, noteId: n.id, content: n.content, hasEmail: false, multiBoard: false }))}
              selectedForLink={selectedForLink}
              isLinking={isLinking}
              onCardClick={handleCardClick}
            />
          )
        ) : (
          cardsLoading ? (
            <p className="pt-2 text-xs text-neutral-700">Loading cards…</p>
          ) : columns.length === 0 ? (
            <EmptyState>No columns in this board</EmptyState>
          ) : columnCards.length === 0 ? (
            <EmptyState>No cards in this column</EmptyState>
          ) : (
            <CardList
              items={columnCards.map((c) => ({
                id: c.id,
                noteId: c.note_id,
                content: c.content,
                hasEmail: emailNoteIds.has(c.note_id),
                multiBoard: c.placement_count > 1,
              }))}
              selectedForLink={selectedForLink}
              isLinking={isLinking}
              onCardClick={handleCardClick}
            />
          )
        )}
      </div>

      {/* Linking CTA — sticky bottom */}
      {isLinking && selectedForLink && (
        <div className="flex-shrink-0 space-y-2 border-t border-white/[0.07] bg-neutral-950 p-3">
          <p className="line-clamp-1 text-xs text-neutral-500">
            {selectedCardContent || "(untitled)"}
          </p>
          {linkError && (
            <p className="text-xs text-red-400">{linkError}</p>
          )}
          <button
            type="button"
            onClick={handleLink}
            disabled={linking}
            className="w-full cursor-pointer rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {linking ? "Linking…" : "Link email to this card"}
          </button>
        </div>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-2 text-xs text-neutral-600">{children}</p>
  );
}

type CardItem = {
  id: string;
  noteId: string;
  content: string;
  hasEmail: boolean;
  multiBoard: boolean;
};

function CardList({
  items,
  selectedForLink,
  isLinking,
  onCardClick,
}: {
  items: CardItem[];
  selectedForLink: string | null;
  isLinking: boolean;
  onCardClick: (noteId: string, content: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const isSelected = selectedForLink === item.noteId;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onCardClick(item.noteId, item.content)}
              className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-all duration-150 ${
                isSelected
                  ? "border-indigo-500/50 bg-indigo-600/[0.15] ring-1 ring-indigo-500/20"
                  : "border-white/[0.07] bg-neutral-900/70 hover:border-white/[0.13] hover:bg-neutral-800/70"
              }`}
            >
              <p className={`line-clamp-2 text-sm leading-snug ${isSelected ? "text-indigo-100" : "text-neutral-200"}`}>
                {item.content}
              </p>
              {(item.hasEmail || item.multiBoard) && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  {item.hasEmail && (
                    <span className="text-[11px] leading-none text-neutral-600" title="Has linked email thread">✉</span>
                  )}
                  {item.multiBoard && (
                    <span className="text-[11px] leading-none text-neutral-600" title="On multiple boards">⬡</span>
                  )}
                </div>
              )}
              {isLinking && !isSelected && (
                <p className="mt-1 text-[10px] text-neutral-700">Tap to select</p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
