"use client";

import { useEffect, useState } from "react";

type BoardBriefingResult = {
  keyUpdates: string[];
  risks: string[];
  milestones: string[];
};

type State = "loading" | "success" | "error";

export function BoardBriefingPanel({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>("loading");
  const [result, setResult] = useState<BoardBriefingResult | null>(null);
  const [meta, setMeta] = useState<{ generatedAt: string; cached?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/ai/board-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId }),
    })
      .then(
        (r) =>
          r.json() as Promise<{
            ok: boolean;
            briefing?: BoardBriefingResult;
            meta?: { generatedAt: string; cached?: boolean };
            error?: string;
          }>,
      )
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.briefing) {
          setResult(data.briefing);
          setMeta(data.meta ?? null);
          setState("success");
        } else {
          setError(data.error ?? "Could not generate briefing.");
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
  }, [boardId]);

  return (
    <div className="mt-2 rounded-lg border border-indigo-900/25 bg-indigo-950/15 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-indigo-400/80">✦ AI Briefing</span>
        <div className="flex items-center gap-2">
          {state === "success" && meta && (
            <span className="text-[10px] text-neutral-700">
              {meta.cached ? "cached · " : ""}
              {new Date(meta.generatedAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-600 transition-colors hover:text-neutral-400"
            aria-label="Close briefing"
          >
            ✕
          </button>
        </div>
      </div>

      {state === "loading" && (
        <p className="text-[11px] text-neutral-600">Generating briefing…</p>
      )}

      {state === "error" && (
        <p className="text-[11px] text-red-400/80">{error}</p>
      )}

      {state === "success" && result && (
        <div className="space-y-2 text-[11px]">
          {result.keyUpdates.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-neutral-600">
                Key Updates
              </p>
              <ul className="space-y-0.5">
                {result.keyUpdates.map((u, i) => (
                  <li key={i} className="flex gap-1.5 leading-snug text-neutral-300">
                    <span className="mt-0.5 flex-shrink-0 text-neutral-700">·</span>
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.risks.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-neutral-600">
                Risks
              </p>
              <ul className="space-y-0.5">
                {result.risks.map((r, i) => (
                  <li key={i} className="flex gap-1.5 leading-snug text-amber-400/80">
                    <span className="mt-0.5 flex-shrink-0 text-amber-700">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.milestones.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-neutral-600">
                Milestones
              </p>
              <ul className="space-y-0.5">
                {result.milestones.map((m, i) => (
                  <li key={i} className="flex gap-1.5 leading-snug text-neutral-300">
                    <span className="mt-0.5 flex-shrink-0 text-neutral-700">·</span>
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.keyUpdates.length === 0 &&
            result.risks.length === 0 &&
            result.milestones.length === 0 && (
              <p className="text-neutral-600">No significant updates to report.</p>
            )}
        </div>
      )}
    </div>
  );
}
