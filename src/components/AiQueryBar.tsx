"use client";

import { useEffect, useRef, useState } from "react";

type QueryCard = {
  id: string;
  title: string;
  boardId: string;
  dueDate: string | null;
  status: string | null;
};

type QueryState = "idle" | "loading" | "success" | "error";

export function AiQueryBar({
  boardId,
  onClose,
  onOpenNote,
}: {
  boardId: string;
  onClose: () => void;
  onOpenNote?: (noteId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [queryState, setQueryState] = useState<QueryState>("idle");
  const [answer, setAnswer] = useState<string | null>(null);
  const [cards, setCards] = useState<QueryCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit() {
    const q = query.trim();
    if (!q || queryState === "loading") return;

    setQueryState("loading");
    setAnswer(null);
    setCards([]);
    setError(null);

    try {
      const r = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, boardId }),
      });
      const data = (await r.json()) as {
        ok: boolean;
        answer?: string;
        relevantCards?: QueryCard[];
        error?: string;
      };

      if (data.ok) {
        setAnswer(data.answer ?? "");
        setCards(data.relevantCards ?? []);
        setQueryState("success");
      } else {
        setError(data.error ?? "Could not process query.");
        setQueryState("error");
      }
    } catch {
      setError("Network error — please try again.");
      setQueryState("error");
    }
  }

  return (
    <div className="border-t border-white/[0.05] bg-neutral-950/80 px-4 pb-3 pt-2.5 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl space-y-2">
        {/* Input row */}
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 text-[11px] font-medium text-indigo-400">✦ Ask</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Ask about this board…"
            maxLength={300}
            className="flex-1 rounded-lg border border-white/[0.07] bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 outline-none transition-colors focus:border-indigo-500/40 focus:bg-neutral-900"
          />
          <button
            type="button"
            disabled={!query.trim() || queryState === "loading"}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {queryState === "loading" ? "…" : "Ask"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-600 transition-colors hover:text-neutral-400"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Results */}
        {queryState === "error" && (
          <p className="text-xs text-red-400/80">{error}</p>
        )}

        {queryState === "success" && answer !== null && (
          <div className="space-y-2">
            <p className="text-xs leading-snug text-neutral-300">{answer}</p>
            {cards.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onOpenNote?.(c.id);
                      onClose();
                    }}
                    className={`max-w-[220px] truncate rounded border border-white/[0.06] bg-neutral-800/60 px-2 py-0.5 text-left text-[11px] text-neutral-300 transition-colors ${
                      onOpenNote
                        ? "cursor-pointer hover:border-white/[0.12] hover:bg-neutral-800"
                        : "cursor-default"
                    }`}
                    title={c.title}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
