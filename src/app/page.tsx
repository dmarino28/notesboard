"use client";

import { useEffect, useState } from "react";
import {
  listNotes,
  createNote,
  deleteNote,
  updateNote,
  moveNote,
  moveColumnNotes,
  type NoteRow,
} from "@/lib/notes";
import {
  listColumns,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  type ColumnRow,
} from "@/lib/columns";
import { useToast } from "@/lib/useToast";
import { Board } from "@/components/Board";
import { ColumnManager } from "@/components/ColumnManager";

export default function Home() {
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    async function load() {
      const [colResult, noteResult] = await Promise.all([listColumns(), listNotes()]);
      if (colResult.error || noteResult.error) {
        setFetchError(colResult.error ?? noteResult.error);
      } else {
        setColumns(colResult.data);
        setNotes(noteResult.data);
      }
      setLoading(false);
    }
    load();
  }, []);

  // --- Note handlers ---

  async function handleAddNote(content: string, columnId: string) {
    const { error } = await createNote(content, columnId);
    if (error) throw new Error(error);
    const { data } = await listNotes();
    setNotes(data);
    showToast("Note added");
  }

  async function handleDeleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    const { error } = await deleteNote(id);
    if (error) {
      const { data } = await listNotes();
      setNotes(data);
      showToast("Failed to delete note");
    } else {
      showToast("Note deleted");
    }
  }

  async function handleUpdateNote(id: string, content: string) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    const { error } = await updateNote(id, content);
    if (error) {
      const { data } = await listNotes();
      setNotes(data);
      throw new Error(error);
    }
    showToast("Note updated");
  }

  async function handleMoveNote(id: string, columnId: string) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, column_id: columnId } : n)));
    const { error } = await moveNote(id, columnId);
    if (error) {
      const { data } = await listNotes();
      setNotes(data);
      showToast("Failed to move note");
    } else {
      showToast("Note moved");
    }
  }

  // --- Column handlers ---

  async function handleAddColumn(name: string) {
    const { data, error } = await createColumn(name);
    if (error) {
      showToast("Failed to add column");
      return;
    }
    if (data) setColumns((prev) => [...prev, data]);
    showToast("Column added");
  }

  async function handleRenameColumn(id: string, name: string) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    const { error } = await updateColumn(id, name);
    if (error) {
      const { data } = await listColumns();
      setColumns(data);
      showToast("Failed to rename column");
    } else {
      showToast("Column renamed");
    }
  }

  async function handleReorderColumns(ids: string[]) {
    const idToCol = Object.fromEntries(columns.map((c) => [c.id, c]));
    setColumns(ids.map((id, i) => ({ ...idToCol[id], position: i })));
    const { error } = await reorderColumns(ids);
    if (error) {
      const { data } = await listColumns();
      setColumns(data);
      showToast("Failed to reorder columns");
    }
  }

  async function handleDeleteColumn(id: string, destColumnId?: string) {
    if (destColumnId) {
      const { error } = await moveColumnNotes(id, destColumnId);
      if (error) {
        showToast("Failed to move notes before deletion");
        return;
      }
      setNotes((prev) =>
        prev.map((n) => (n.column_id === id ? { ...n, column_id: destColumnId } : n)),
      );
    }
    const { error } = await deleteColumn(id);
    if (error) {
      showToast("Failed to delete column");
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== id));
    showToast("Column deleted");
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">NotesBoard</h1>
            <p className="text-sm text-neutral-400">Your notes, organized by column.</p>
          </div>
          <button
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
            onClick={() => setShowManager((v) => !v)}
          >
            {showManager ? "Close" : "Manage Columns"}
          </button>
        </header>

        {toast && (
          <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
            {toast}
          </div>
        )}

        {showManager && (
          <ColumnManager
            columns={columns}
            notes={notes}
            onAdd={handleAddColumn}
            onRename={handleRenameColumn}
            onReorder={handleReorderColumns}
            onDelete={handleDeleteColumn}
          />
        )}

        <Board
          columns={columns}
          notes={notes}
          loading={loading}
          error={fetchError}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onUpdateNote={handleUpdateNote}
          onMoveNote={handleMoveNote}
        />
      </div>
    </main>
  );
}
