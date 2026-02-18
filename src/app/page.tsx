"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type NoteRow = {
  id: string;
  content: string;
  created_at: string;
};

export default function Home() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadNotes() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("notes")
      .select("id, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setNotes([]);
    } else {
      setNotes((data ?? []) as NoteRow[]);
    }

    setLoading(false);
  }

  async function addNote() {
    const trimmed = content.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("notes").insert([{ content: trimmed }]);

    if (error) {
      setError(error.message);
    } else {
      setContent("");
      setToast("Note added");
      // refresh list
      await loadNotes();
      // auto-hide toast
      window.setTimeout(() => setToast(null), 1500);
    }

    setSaving(false);
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

        {/* Toast */}
        {toast && (
          <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
            {toast}
          </div>
        )}

        {/* Add note */}
        <section className="space-y-3">
          <textarea
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm outline-none focus:border-neutral-700"
            rows={3}
            placeholder="Write a note..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <div className="flex items-center gap-3">
            <button
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              onClick={addNote}
              disabled={saving || !content.trim()}
            >
              {saving ? "Saving..." : "Add note"}
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </section>

        {/* Notes list */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Saved
          </h2>

          {loading ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-neutral-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border border-neutral-800 bg-neutral-950 p-3"
                >
                  <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

