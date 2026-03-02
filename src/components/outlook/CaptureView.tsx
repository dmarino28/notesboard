"use client";

import { useEffect, useState } from "react";
import { type OutlookThread } from "@/lib/outlookContext";
import { listThreadLinksByConversationId } from "@/lib/emailThreads";
import { listBoards, type BoardRow } from "@/lib/boards";
import { listColumns, type ColumnRow } from "@/lib/columns";

type LinkRef = { noteId: string; noteTitle: string; boardId: string };

type Props = {
  thread: OutlookThread | null;
  isDevMode: boolean;
  onOpenCard: (noteId: string) => void;
  onStartLinking: () => void;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-neutral-600">
      {children}
    </label>
  );
}

export function CaptureView({ thread, isDevMode, onOpenCard, onStartLinking }: Props) {
  const [existingLinks, setExistingLinks] = useState<LinkRef[] | null>(null);
  const [createExpanded, setCreateExpanded] = useState(false);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!thread) {
      setExistingLinks(null);
      return;
    }
    // Capture in a local const so the async closure retains the non-null type.
    const t = thread;
    async function load() {
      const [links, boardsResult] = await Promise.all([
        listThreadLinksByConversationId(t.conversationId),
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
  }, [thread?.conversationId]);

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

  // ── Create ───────────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!thread || !selectedBoardId || !selectedColumnId) return;
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

  // ── No selection ─────────────────────────────────────────────────────────────
  if (!thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-xs text-neutral-500">Select a single email to continue.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Thread identity */}
      <div className="flex-shrink-0 space-y-0.5 border-b border-white/[0.07] px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100">
          {thread.subject || "(no subject)"}
        </p>

        {/* 🔎 Build marker (remove later) */}
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-fuchsia-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300 ring-1 ring-fuchsia-800/40">
            POLISH TEST • eaf51b2
          </span>
        </div>

        {thread.mailbox && (
          <p className="truncate text-xs text-neutral-600">{thread.mailbox}</p>
        )}
        {isDevMode && (
          <span className="mt-1 inline-block rounded-md bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400/80 ring-1 ring-amber-800/40">
            dev mode
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <div className="nb-scroll flex-1 space-y-3 overflow-y-auto p-4">
        {/* Link status */}
        {existingLinks === null ? (
          <p className="text-xs text-neutral-700">Checking links…</p>
        ) : existingLinks.length > 0 ? (
          <div className="space-y-1.5 rounded-xl border border-sky-800/30 bg-sky-950/25 px-3 py-2.5">
            <p className="text-xs font-semibold text-sky-400">
              Linked to {existingLinks.length} card{existingLinks.length > 1 ? "s" : ""}
            </p>
            <ul className="space-y-0.5">
              {existingLinks.map((link) => (
                <li key={link.noteId} className="line-clamp-1 text-xs text-neutral-500">
                  {link.noteTitle || "(untitled)"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Primary actions */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setCreateExpanded((v) => !v);
              setCreateError(null);
            }}
            className={`w-full cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
              createExpanded
                ? "border border-white/[0.08] bg-transparent text-neutral-500 hover:text-neutral-300"
                : "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 active:bg-indigo-700"
            }`}
          >
            {createExpanded ? "↑ Cancel" : "Create Card"}
          </button>

          <button
            type="button"
            onClick={onStartLinking}
            className="w-full cursor-pointer rounded-xl border border-white/[0.08] bg-transparent px-3 py-2.5 text-sm font-medium text-neutral-400 transition-colors duration-150 hover:border-white/[0.16] hover:text-neutral-200"
          >
            Link to a Card →
          </button>
        </div>

        {/* Expandable create form */}
        {createExpanded && (
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-neutral-900/60 p-3">
            <div className="space-y-1">
              <FieldLabel>Board</FieldLabel>
              <select
                value={selectedBoardId}
                onChange={(e) => {
                  setSelectedBoardId(e.target.value);
                  setCreateError(null);
                }}
                className="w-full cursor-pointer rounded-lg border border-white/[0.08] bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-200 outline-none transition-colors focus:border-white/[0.16]"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name === "Landing Pad" ? `${b.name} ★` : b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <FieldLabel>Column</FieldLabel>
              <select
                value={selectedColumnId}
                onChange={(e) => setSelectedColumnId(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-white/[0.08] bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-200 outline-none transition-colors focus:border-white/[0.16]"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {columns.length === 0 && (
                  <option value="" disabled>
                    No columns
                  </option>
                )}
              </select>
            </div>

            {createError && (
              <p className="rounded-lg border border-red-900/40 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-400">
                {createError}
              </p>
            )}

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !selectedBoardId || !selectedColumnId}
              className="w-full cursor-pointer rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Card"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}