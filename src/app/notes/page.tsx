"use client";

import { useEffect, useState } from "react";
import { SharedTopBar } from "@/components/SharedTopBar";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import { listBoards } from "@/lib/boards";

export default function NotesPage() {
  const [entries, setEntries] = useState<NoteEntryWithSignals[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [boardsResult, entriesRes] = await Promise.all([
        listBoards(),
        fetch("/api/note-entries"),
      ]);

      if (boardsResult.error) {
        setError("Could not load boards");
        return;
      }
      setBoards(boardsResult.data ?? []);

      if (entriesRes.ok) {
        const { entries: raw } = await entriesRes.json() as { entries: NoteEntryWithSignals[] };
        setEntries(raw ?? []);
      }
    } catch {
      setError("Failed to load notes");
    } finally {
      setLoading(false);
    }
  }

  const boardHref = boards.length > 0 ? `/board/${boards[0].id}` : "/";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[--nb-page-bg]">
      <SharedTopBar boardHref={boardHref} />

      <main className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-sm text-red-500">{error}</div>
        ) : (
          <NotesWorkspace initialEntries={entries} boards={boards} />
        )}
      </main>
    </div>
  );
}
