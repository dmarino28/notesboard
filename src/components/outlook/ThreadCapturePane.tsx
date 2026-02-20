"use client";

import { useEffect, useState } from "react";
import { type ReadItemResult, type OutlookThread } from "@/lib/outlookContext";
import {
  upsertEmailThreadForNote,
  listThreadLinksByConversationId,
} from "@/lib/emailThreads";
import { listBoards, type BoardRow } from "@/lib/boards";
import { listColumns, type ColumnRow } from "@/lib/columns";
import { searchNotes, listBrowsableCards, type BrowsableCard } from "@/lib/noteSearch";
import { supabase } from "@/lib/supabase";

// Used when Office.js is not available (browser dev context).
const DEV_THREAD: OutlookThread = {
  conversationId: "dummy-conv-dev-001",
  messageId: "dummy-msg-dev-001",
  webLink: null,
  subject: "Dev Mode — Q1 Planning Discussion",
  provider: "outlook",
  mailbox: "dev@example.com",
};

type LinkRef = { noteId: string; noteTitle: string; boardId: string };
type Tab = "create" | "link";
type Props = { init: ReadItemResult };

export function ThreadCapturePane({ init }: Props) {
  const isDevMode = init.kind === "no_office";
  const isError = init.kind === "error";
  const thread = init.kind === "ok" ? init.thread : DEV_THREAD;

  // ── Existing links for this conversation ─────────────────────────────────────
  // null = loading, [] = none, [...] = linked to these cards
  const [existingLinks, setExistingLinks] = useState<LinkRef[] | null>(null);

  // ── Create flow ───────────────────────────────────────────────────────────────
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [tab, setTab] = useState<Tab>("create");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // ── Link flow ─────────────────────────────────────────────────────────────────
  const [browseCards, setBrowseCards] = useState<BrowsableCard[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; content: string }[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  // ── Init: existing links + boards + browse cards ──────────────────────────────
  useEffect(() => {
    if (isError) return;
    async function load() {
      const [links, boardsResult, cards] = await Promise.all([
        listThreadLinksByConversationId(thread.conversationId),
        listBoards(),
        listBrowsableCards(30),
      ]);
      setExistingLinks(links);
      setBrowseCards(cards);
      setBrowseLoading(false);
      if (boardsResult.data?.length) {
        const sorted = [
          ...boardsResult.data.filter((b) => b.name === "Landing Pad"),
          ...boardsResult.data.filter((b) => b.name !== "Landing Pad"),
        ];
        setBoards(sorted);
        setSelectedBoardId(sorted[0].id);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.conversationId, isError]);

  // ── Load columns when board changes ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedBoardId) return;
    listColumns(selectedBoardId).then(({ data }) => {
      if (data?.length) {
        setColumns(data);
        setSelectedColumnId(data[0].id);
      } else {
        setColumns([]);
        setSelectedColumnId("");
      }
    });
  }, [selectedBoardId]);

  // ── Note search (debounced 350ms) ─────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      setSearchResults(await searchNotes(q));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Create card ───────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!selectedBoardId || !selectedColumnId) return;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const res = await fetch("/api/email/create-note-from-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: thread.subject || "(no subject)",
          boardId: selectedBoardId,
          columnId: selectedColumnId,
          provider: thread.provider,
          mailbox: thread.mailbox,
          conversationId: thread.conversationId,
          messageId: thread.messageId,
          webLink: thread.webLink,
          subject: thread.subject,
          lastActivityAt: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create card");
      setExistingLinks((prev) => [
        ...(prev ?? []),
        { noteId: json.noteId, noteTitle: thread.subject || "(no subject)", boardId: selectedBoardId },
      ]);
      setCreateSuccess("Card created and linked.");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  // ── Link to existing card ─────────────────────────────────────────────────────
  async function handleLink() {
    if (!selectedNoteId) return;

    // Block duplicate: same thread already linked to this exact card.
    if (existingLinks?.some((l) => l.noteId === selectedNoteId)) {
      setLinkError("This thread is already linked to this card.");
      return;
    }

    setLinking(true);
    setLinkError(null);
    setLinkSuccess(null);
    try {
      const { error } = await upsertEmailThreadForNote({
        noteId: selectedNoteId,
        provider: thread.provider,
        conversationId: thread.conversationId,
        messageId: thread.messageId,
        webLink: thread.webLink,
        subject: thread.subject,
        mailbox: thread.mailbox,
        lastActivityAt: new Date().toISOString(),
      });
      if (error) throw new Error(error);

      // Resolve board ID: prefer browse cache, fall back to DB query.
      const browsed = browseCards.find((c) => c.noteId === selectedNoteId);
      let boardId = browsed?.boardId ?? "";
      if (!boardId) {
        const { data: placement } = await supabase
          .from("note_placements")
          .select("board_id")
          .eq("note_id", selectedNoteId)
          .limit(1)
          .maybeSingle();
        boardId = (placement as { board_id: string } | null)?.board_id ?? "";
      }

      const noteTitle =
        browsed?.content ??
        searchResults.find((r) => r.id === selectedNoteId)?.content ??
        "";

      setExistingLinks((prev) => [
        ...(prev ?? []),
        { noteId: selectedNoteId, noteTitle, boardId },
      ]);
      setLinkSuccess("Linked successfully.");
      setSelectedNoteId(null);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLinking(false);
    }
  }

  // ── Open board in external browser ───────────────────────────────────────────
  function openBoard(boardId: string) {
    const url = boardId
      ? `${window.location.origin}/board/${boardId}`
      : window.location.origin;
    if (typeof Office !== "undefined") {
      try {
        Office.context.ui.openBrowserWindow(url);
        return;
      } catch {}
    }
    window.open(url, "_blank");
  }

  // ── Error state ───────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/8 bg-neutral-900 px-4 py-3">
          <span className="text-base">✉️</span>
          <span className="text-sm font-semibold">NotesBoard</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm text-neutral-400">
            {(init as { kind: "error"; message: string }).message}
          </p>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">

      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/8 bg-neutral-900 px-4 py-3">
        <span className="text-base">✉️</span>
        <span className="text-sm font-semibold">NotesBoard</span>
        {isDevMode && (
          <span className="ml-auto rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            dev
          </span>
        )}
      </div>

      {/* Subject + mailbox */}
      <div className="flex-shrink-0 border-b border-white/8 px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100">
          {thread.subject || "(no subject)"}
        </p>
        {thread.mailbox && (
          <p className="mt-1 truncate text-xs text-neutral-500">{thread.mailbox}</p>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">

        {/* Existing links info banner */}
        {existingLinks === null && (
          <p className="text-xs text-neutral-600">Checking existing links…</p>
        )}
        {existingLinks && existingLinks.length > 0 && (
          <div className="rounded-lg border border-sky-800/50 bg-sky-900/20 px-3 py-2.5">
            <p className="text-xs font-medium text-sky-400">
              Linked to {existingLinks.length} card{existingLinks.length > 1 ? "s" : ""}
            </p>
            <ul className="mt-1.5 space-y-1">
              {existingLinks.map((link) => (
                <li key={link.noteId}>
                  <button
                    onClick={() => openBoard(link.boardId)}
                    className="line-clamp-1 w-full text-left text-xs text-neutral-300 hover:text-neutral-100 hover:underline"
                  >
                    {link.noteTitle || "(untitled)"} →
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-0.5 rounded-lg bg-neutral-900 p-0.5">
          {(["create", "link"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t === "create" ? "Create card" : "Link to card"}
            </button>
          ))}
        </div>

        {/* ── Create tab ── */}
        {tab === "create" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Board</label>
              <select
                value={selectedBoardId}
                onChange={(e) => {
                  setSelectedBoardId(e.target.value);
                  setCreateError(null);
                  setCreateSuccess(null);
                }}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-500"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name === "Landing Pad" ? `${b.name} ★` : b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Column</label>
              <select
                value={selectedColumnId}
                onChange={(e) => setSelectedColumnId(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-500"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                {columns.length === 0 && (
                  <option value="" disabled>No columns</option>
                )}
              </select>
            </div>

            {createError && <p className="text-xs text-red-400">{createError}</p>}
            {createSuccess && <p className="text-xs text-emerald-400">{createSuccess}</p>}

            <button
              onClick={handleCreate}
              disabled={creating || !selectedBoardId || !selectedColumnId}
              className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Card"}
            </button>
          </div>
        )}

        {/* ── Link tab ── */}
        {tab === "link" && (
          <div className="space-y-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedNoteId(null);
                setLinkError(null);
                setLinkSuccess(null);
              }}
              placeholder="Search cards…"
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
            />

            {/* Browse list (default, no search query) */}
            {!searchQuery.trim() && (
              <div>
                {browseLoading ? (
                  <p className="text-xs text-neutral-600">Loading cards…</p>
                ) : browseCards.length === 0 ? (
                  <p className="text-xs text-neutral-600">No cards yet.</p>
                ) : (
                  <ul className="max-h-52 space-y-0.5 overflow-y-auto">
                    {browseCards.map((card) => {
                      const boardName = boards.find((b) => b.id === card.boardId)?.name;
                      const isSelected = selectedNoteId === card.noteId;
                      return (
                        <li key={card.noteId}>
                          <button
                            onClick={() => {
                              setSelectedNoteId(card.noteId);
                              setLinkError(null);
                              setLinkSuccess(null);
                            }}
                            className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? "bg-indigo-600/30 text-indigo-200 ring-1 ring-inset ring-indigo-500/50"
                                : "text-neutral-300 hover:bg-neutral-800"
                            }`}
                          >
                            <span className="line-clamp-2 text-sm leading-snug">
                              {card.content}
                            </span>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {boardName && (
                                <span className="text-[10px] text-neutral-500">{boardName}</span>
                              )}
                              {card.hasEmailThread && (
                                <span className="text-[10px]" title="Has email thread">✉</span>
                              )}
                              {card.placementCount > 1 && (
                                <span className="text-[10px] text-neutral-500" title="On multiple boards">🔗</span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Search results (when query is active) */}
            {searchQuery.trim() && (
              <div>
                {searching && <p className="text-xs text-neutral-600">Searching…</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="text-xs text-neutral-600">No cards found.</p>
                )}
                {searchResults.length > 0 && (
                  <ul className="max-h-52 space-y-0.5 overflow-y-auto">
                    {searchResults.map((note) => (
                      <li key={note.id}>
                        <button
                          onClick={() => {
                            setSelectedNoteId(note.id);
                            setLinkError(null);
                            setLinkSuccess(null);
                          }}
                          className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            selectedNoteId === note.id
                              ? "bg-indigo-600/30 text-indigo-200 ring-1 ring-inset ring-indigo-500/50"
                              : "text-neutral-300 hover:bg-neutral-800"
                          }`}
                        >
                          <span className="line-clamp-2">{note.content}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {linkError && <p className="text-xs text-red-400">{linkError}</p>}
            {linkSuccess && <p className="text-xs text-emerald-400">{linkSuccess}</p>}

            <button
              onClick={handleLink}
              disabled={linking || !selectedNoteId}
              className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {linking ? "Linking…" : "Link to this card"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
