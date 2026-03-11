"use client";

import { useEffect, useState } from "react";

type CardSummaryResult = {
  currentState: string;
  keyDecision: string | null;
  nextStep: string | null;
};

type State = "loading" | "success" | "error";

export function AiCardSummary({
  noteId,
  onDismiss,
  onInsert,
}: {
  noteId: string;
  onDismiss: () => void;
  /** Called with formatted summary text when user clicks "Insert as update" */
  onInsert?: (text: string) => void;
}) {
  const [state, setState] = useState<State>("loading");
  const [result, setResult] = useState<CardSummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/ai/card-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: noteId }),
    })
      .then((r) => r.json() as Promise<{ ok: boolean; summary?: CardSummaryResult; error?: string }>)
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.summary) {
          setResult(data.summary);
          setState("success");
        } else {
          setError(data.error ?? "Could not generate summary.");
          setState("error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Network error — please try again.");
          setState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  return (
    <div className="rounded-lg border border-indigo-900/30 bg-indigo-950/20 px-3 py-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-indigo-400">✦ AI Summary</span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-neutral-600 transition-colors hover:text-neutral-400"
          aria-label="Dismiss summary"
        >
          ✕
        </button>
      </div>

      {state === "loading" && (
        <p className="text-neutral-600">Generating summary…</p>
      )}

      {state === "error" && (
        <p className="text-red-400/80">{error}</p>
      )}

      {state === "success" && result && (
        <div className="space-y-1.5">
          <p className="leading-snug text-neutral-300">{result.currentState}</p>
          {result.keyDecision && (
            <p className="leading-snug text-neutral-500">
              <span className="text-neutral-600">Decision: </span>
              {result.keyDecision}
            </p>
          )}
          {result.nextStep && (
            <p className="leading-snug text-neutral-500">
              <span className="text-neutral-600">Next: </span>
              {result.nextStep}
            </p>
          )}
          {onInsert && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => {
                  const lines = [result.currentState];
                  if (result.keyDecision) lines.push(`Decision: ${result.keyDecision}`);
                  if (result.nextStep) lines.push(`Next: ${result.nextStep}`);
                  onInsert(lines.join("\n"));
                  onDismiss();
                }}
                className="text-[11px] text-indigo-400/70 transition-colors hover:text-indigo-300"
              >
                → Insert as update
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
