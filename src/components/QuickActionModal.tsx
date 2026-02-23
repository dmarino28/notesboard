"use client";

import { useState } from "react";
import type { ActionMode, TagDef } from "@/lib/userActions";
import { createQuickAction } from "@/lib/userActions";

type Props = {
  tagDefs: TagDef[];
  onCreated: (noteId: string) => void;
  onClose: () => void;
};

export function QuickActionModal({ tagDefs, onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<ActionMode>("timed");
  const [dueDate, setDueDate] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const sortedDefs = [...tagDefs].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    );
  }

  async function handleSubmit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    const noteId = await createQuickAction({
      title: title.trim(),
      description: description.trim() || undefined,
      action_mode: mode,
      action_state: "needs_action",
      personal_due_date: mode === "timed" && dueDate ? dueDate : null,
      private_tags: mode === "flagged" ? selectedTags : [],
    });
    setSaving(false);
    if (noteId) {
      onCreated(noteId);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.07] bg-neutral-900 p-5 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">Quick Action</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 transition-colors hover:text-neutral-300"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* Title */}
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            type="text"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) void handleSubmit();
            }}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-indigo-500/50"
          />

          {/* Description */}
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300 outline-none placeholder:text-neutral-600 focus:border-indigo-500/50"
          />

          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-600">Mode:</span>
            {(["timed", "flagged"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  mode === m
                    ? "border-indigo-900/30 bg-indigo-950/60 text-indigo-400"
                    : "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
                }`}
              >
                {m === "timed" ? "Timed" : "Flagged"}
              </button>
            ))}
          </div>

          {/* Due date (Timed only) */}
          {mode === "timed" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-600">Due:</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-md border border-neutral-800 bg-neutral-800/60 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-indigo-500/50"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="text-xs text-neutral-600 transition-colors hover:text-neutral-400"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Group picker (Flagged only) */}
          {mode === "flagged" && sortedDefs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-neutral-600">Groups:</p>
              <div className="flex flex-wrap gap-1.5">
                {sortedDefs.map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => toggleTag(def.name)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      selectedTags.includes(def.name)
                        ? "border-indigo-900/30 bg-indigo-950/60 text-indigo-400"
                        : "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
                    }`}
                  >
                    {def.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!title.trim() || saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
