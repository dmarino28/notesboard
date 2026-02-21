"use client";

import { useEffect, useState } from "react";
import { type OutlookThread } from "@/lib/outlookContext";
import { listThreadLinksByConversationId } from "@/lib/emailThreads";
import { listBoards, type BoardRow } from "@/lib/boards";
import { listColumns, type ColumnRow } from "@/lib/columns";

type LinkRef = { noteId: string; noteTitle: string; boardId: string };

type Props = {
  thread: OutlookThread;
  isDevMode: boolean;
  /** Called after a card is created — navigates directly to Card Details. */
  onOpenCard: (noteId: string) => void;
  /** Called when user clicks "Link to a Card →" — enters linking mode in Browse. */
  onStartLinking: () => void;
};

export function CaptureView({ thread, isDevMode, onOpenCard, onStartLinking }: Props) {
  const [existingLinks, setExistingLinks] = useState<LinkRef[] | null>(null);
  const [createExpanded, setCreateExpanded] = useState(false);

  // Create form state (boards/columns pre-loaded on mount so the form is instant)
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [links, boardsResult] = await Promise.all([
        listThreadLinksByConversationId(thread.conversationId),
        listBoards(),
      ]);
      setExistingLinks(links);
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
  }, [thread.conversationId]);

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

  // ── Create card ───────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!selectedBoardId || !selectedColumnId) return;
    setCreating(true);
    setCreateError(null);
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
      onOpenCard(json.noteId);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Unknown error");
      setCreating(false);
    }
  }

  return (
    // No overflow-y-auto on the outer wrapper — scroll only happens on the inner flex-1 div
    <div className="flex h-full flex-col">

      {/* Subject + mailbox */}
      <div className="flex-shrink-0 border-b border-white/8 px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100">
          {thread.subject || "(no subject)"}
        </p>
        {thread.mailbox && (
          <p className="mt-0.5 truncate text-xs text-neutral-500">{thread.mailbox}</p>
        )}
        {isDevMode && (
          <span className="mt-1 inline-block rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            dev mode
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">

        {/* Linked status banner */}
        {existingLinks === null && (
          <p className="text-xs text-neutral-600">Checking links…</p>
        )}
        {existingLinks && existingLinks.length > 0 && (
          <div className="rounded-lg border border-sky-800/50 bg-sky-900/20 px-3 py-2.5">
            <p className="text-xs font-medium text-sky-400">
              Linked to {existingLinks.length} card{existingLinks.length > 1 ? "s" : ""}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {existingLinks.map((link) => (
                <li key={link.noteId} className="line-clamp-1 text-xs text-neutral-400">
                  {link.noteTitle || "(untitled)"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Primary action buttons */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { setCreateExpanded((v) => !v); setCreateError(null); }}
            className={`w-full cursor-pointer rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
              createExpanded
                ? "border border-neutral-700 bg-transparent text-neutral-400 hover:text-neutral-200"
                : "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
            }`}
          >
            {createExpanded ? "↑ Cancel" : "Create Card"}
          </button>
          <button
            type="button"
            onClick={onStartLinking}
            className="w-full cursor-pointer rounded-md border border-neutral-700 bg-transparent px-3 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100"
          >
            Link to a Card →
          </button>
        </div>

        {/* Expandable create form */}
        {createExpanded && (
          <div className="space-y-3 rounded-lg border border-white/8 bg-neutral-900/60 p-3">
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Board</label>
              <select
                value={selectedBoardId}
                onChange={(e) => { setSelectedBoardId(e.target.value); setCreateError(null); }}
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
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                {columns.length === 0 && <option value="" disabled>No columns</option>}
              </select>
            </div>
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !selectedBoardId || !selectedColumnId}
              className="w-full cursor-pointer rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Card"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
