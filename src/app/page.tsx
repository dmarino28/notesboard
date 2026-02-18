"use client";

import { useEffect, useState } from "react";
import { listNotes, createNote, deleteNote, updateNote, type NoteRow } from "@/lib/notes";
import { useToast } from "@/lib/useToast";
import { NoteComposer } from "@/components/NoteComposer";
import { NoteList } from "@/components/NoteList";

export default function Home() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  useEffect(() => {
    listNotes().then(({ data, error }) => {
      if (error) setFetchError(error);
      else setNotes(data);
      setLoading(false);
    });
  }, []);

  async function handleAdd(content: string) {
    const { error } = await createNote(content);
    if (error) throw new Error(error);
    const { data } = await listNotes();
    setNotes(data);
    showToast("Note added");
  }

  async function handleDelete(id: string) {
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

  async function handleUpdate(id: string, content: string) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    const { error } = await updateNote(id, content);
    if (error) {
      const { data } = await listNotes();
      setNotes(data);
      throw new Error(error);
    }
    showToast("Note updated");
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">NotesBoard</h1>
          <p className="text-sm text-neutral-400">Quick notes, saved to Supabase.</p>
        </header>

        {toast && (
          <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
            {toast}
          </div>
        )}

        <NoteComposer onAdd={handleAdd} />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Saved
          </h2>
          <NoteList
            notes={notes}
            loading={loading}
            error={fetchError}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
          />
        </section>
      </div>
    </main>
  );
}
