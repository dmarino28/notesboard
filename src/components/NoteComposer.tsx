"use client";

import { useRef, useState } from "react";

type Props = {
  onAdd: (content: string) => Promise<void>;
};

export function NoteComposer({ onAdd }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const submittingRef = useRef(false);

  function handleExpand() {
    submittingRef.current = false;
    setExpanded(true);
  }

  async function submit() {
    if (submittingRef.current) return;
    const trimmed = content.trim();
    if (!trimmed) {
      setExpanded(false);
      setContent("");
      return;
    }
    submittingRef.current = true;
    try {
      await onAdd(trimmed);
      setContent("");
      setExpanded(false);
    } catch {
      submittingRef.current = false;
      setExpanded(false);
      setContent("");
    }
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      await submit();
    } else if (e.key === "Escape") {
      setContent("");
      setExpanded(false);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={handleExpand}
        className="w-full rounded-lg border border-dashed border-white/15 bg-transparent px-3 py-2 text-left text-xs text-neutral-500 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-neutral-300"
      >
        + Add card
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={content}
      onChange={(e) => setContent(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={submit}
      placeholder="Card title…"
      className="w-full rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-600"
    />
  );
}
