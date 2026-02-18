"use client";

import { useState } from "react";

type Props = {
  onAdd: (content: string) => Promise<void>;
};

export function NoteComposer({ onAdd }: Props) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = content.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);

    try {
      await onAdd(trimmed);
      setContent("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
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
          onClick={handleAdd}
          disabled={saving || !content.trim()}
        >
          {saving ? "Saving..." : "Add note"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </section>
  );
}
