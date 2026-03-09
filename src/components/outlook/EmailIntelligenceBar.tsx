"use client";

import { useState } from "react";

type FlagBarProps = {
  followUpDate: string | null;
  /** Extra context shown after "Flagged ·" (e.g. "adds to My Actions on capture") */
  bodyText?: string;
  /** If provided, renders a primary CTA button */
  ctaLabel?: string;
  onCta?: () => Promise<void>;
  onIgnore: () => void;
};

type CtaState = "idle" | "working" | "done" | "error";

export function FlagBar({
  followUpDate,
  bodyText,
  ctaLabel,
  onCta,
  onIgnore,
}: FlagBarProps) {
  const [ctaState, setCtaState] = useState<CtaState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCta() {
    if (!onCta) return;
    setCtaState("working");
    setErrorMsg(null);
    try {
      await onCta();
      setCtaState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed");
      setCtaState("error");
    }
  }

  const label = [
    followUpDate ? `Flagged · due ${followUpDate}` : "Flagged",
    bodyText,
  ]
    .filter(Boolean)
    .join(" · ");

  if (ctaState === "done") {
    return (
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-amber-900/30 bg-amber-950/20 px-3 py-2">
        <span className="text-[11px] text-amber-500">⚑</span>
        <p className="flex-1 text-xs text-amber-400/70">Added to My Actions ✓</p>
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-amber-900/30 bg-amber-950/20 px-3 py-2">
      <span className="text-[11px] text-amber-500">⚑</span>
      <p className="min-w-0 flex-1 truncate text-xs text-amber-400/80">{label}</p>

      {ctaState === "error" && errorMsg && (
        <span className="shrink-0 text-[11px] text-red-400">{errorMsg}</span>
      )}

      {ctaLabel && onCta && ctaState !== "working" && (
        <button
          type="button"
          onClick={handleCta}
          className="shrink-0 cursor-pointer rounded-md bg-amber-600/25 px-2 py-0.5 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-600/40"
        >
          {ctaState === "error" ? "Retry" : ctaLabel}
        </button>
      )}

      {ctaState === "working" && (
        <span className="shrink-0 text-[11px] text-amber-500/50">Adding…</span>
      )}

      <button
        type="button"
        onClick={onIgnore}
        aria-label="Dismiss"
        className="shrink-0 cursor-pointer rounded p-0.5 text-[11px] leading-none text-neutral-600 transition-colors hover:text-neutral-400"
      >
        ×
      </button>
    </div>
  );
}
