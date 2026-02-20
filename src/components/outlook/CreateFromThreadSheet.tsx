"use client";

import { useEffect, useState } from "react";
import { BoardRow } from "@/lib/boards";
import { ColumnRow, listColumns } from "@/lib/columns";
import { type OutlookThread } from "@/lib/outlookContext";

type Props = {
  thread: OutlookThread;
  boards: BoardRow[];
  landingPadBoardId: string;
  onCreated: (result: { noteId: string; boardId: string }) => void;
  onCancel: () => void;
};

export function CreateFromThreadSheet({ thread, boards, landingPadBoardId, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState(thread.subject);
  const [selectedBoardId, setSelectedBoardId] = useState(landingPadBoardId);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load columns whenever board changes
  useEffect(() => {
    if (!selectedBoardId) return;
    setColumnsLoading(true);
    setSelectedColumnId("");
    listColumns(selectedBoardId).then(({ data }) => {
      setColumns(data);
      if (data.length > 0) setSelectedColumnId(data[0].id);
      setColumnsLoading(false);
    });
  }, [selectedBoardId]);

  // Sort boards: Landing Pad first
  const sortedBoards = [
    ...boards.filter((b) => b.id === landingPadBoardId),
    ...boards.filter((b) => b.id !== landingPadBoardId),
  ];

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }
    if (!selectedBoardId || !selectedColumnId) {
      setError("Select a board and column.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/email/create-note-from-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          boardId: selectedBoardId,
          columnId: selectedColumnId,
          provider: thread.provider,
          mailbox: thread.mailbox,
          conversationId: thread.conversationId,
          messageId: thread.messageId,
          webLink: thread.webLink,
          subject: thread.subject,
        }),
      });

      const json = (await res.json()) as { noteId?: string; placementId?: string; error?: string };

      if (!res.ok || !json.noteId) {
        setError(json.error ?? "Failed to create card.");
        setSubmitting(false);
        return;
      }

      onCreated({ noteId: json.noteId, boardId: selectedBoardId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onCancel}
      />

      {/* Sheet */}
      <div className="fixed inset-x-4 top-20 z-50 rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2">
        {/* Thread preview */}
        <div className="mb-4 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2.5">
          <p className="text-xs font-medium text-neutral-400">
            {thread.conversationId.startsWith("dummy-") ? "Email thread (prototype)" : "Email thread"}
          </p>
          <p className="mt-0.5 truncate text-sm text-neutral-200">{thread.subject}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">{thread.mailbox}</p>
        </div>

        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Card title</label>
            <input
              autoFocus
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) void handleSubmit();
                if (e.key === "Escape") onCancel();
              }}
              placeholder="Card title…"
            />
          </div>

          {/* Board */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Board</label>
            <select
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
            >
              {sortedBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name === "Landing Pad" ? `${b.name} ★` : b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Column */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Column</label>
            {columnsLoading ? (
              <p className="text-xs text-neutral-600">Loading…</p>
            ) : columns.length === 0 ? (
              <p className="text-xs text-neutral-500">No columns on this board.</p>
            ) : (
              <select
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                value={selectedColumnId}
                onChange={(e) => setSelectedColumnId(e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !selectedColumnId}
            >
              {submitting ? "Creating…" : "Create card"}
            </button>
            <button
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
