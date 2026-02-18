"use client";

import { useEffect, useState } from "react";
import { listNotes, createNote, type NoteRow } from "@/lib/notes";
import { NoteComposer } from "@/components/NoteComposer";
import { NoteList } from "@/components/NoteList";

export default function Home() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadNotes() {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await listNotes();
    if (error) setFetchError(error);
    else setNotes(data);
    setLoading(false);
  }

  async function handleAdd(content: string) {
    const { error } = await createNote(content);
    if (error) throw new Error(error);
    await loadNotes();
    setToast("Note added");
    window.setTimeout(() => setToast(null), 1500);
  }

  useEffect(() => {
    loadNotes();
  }, []);

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
          <NoteList notes={notes} loading={loading} error={fetchError} />
        </section>
      </div>
    </main>
  );
}
