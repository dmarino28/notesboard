"use client";

import { useState } from "react";
import { type ReadItemResult } from "@/lib/outlookContext";
import { BoardBrowserView } from "./BoardBrowserView";
import { CaptureView } from "./CaptureView";
import { CardDetailPane } from "./CardDetailPane";

type Tab = "capture" | "browse";
type ViewState =
  | { kind: "list"; tab: Tab }
  | { kind: "card-detail"; noteId: string; returnTab: Tab };

type Props = { init: ReadItemResult };

export function OutlookAddinShell({ init }: Props) {
  const isDevMode = init.kind === "no_office";

  // Default to "capture" so the active email is the first thing the user sees.
  const [view, setView] = useState<ViewState>({ kind: "list", tab: "capture" });

  function openCard(noteId: string) {
    const returnTab: Tab = view.kind === "list" ? view.tab : "browse";
    setView({ kind: "card-detail", noteId, returnTab });
  }

  function goBack() {
    if (view.kind === "card-detail") {
      setView({ kind: "list", tab: view.returnTab });
    }
  }

  const isCardDetail = view.kind === "card-detail";
  const activeTab: Tab = view.kind === "list" ? view.tab : "capture";

  // ── Error state ───────────────────────────────────────────────────────────────
  if (init.kind === "error") {
    return (
      <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
        <ShellHeader />
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-sm text-neutral-400">{init.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">

      {/* ── Header ── */}
      <ShellHeader isDevMode={isDevMode} isCardDetail={isCardDetail} onBack={goBack} />

      {/* ── Tab bar (hidden during card-detail to give full height to the detail) ── */}
      {!isCardDetail && (
        <div className="flex flex-shrink-0 gap-0.5 border-b border-white/8 bg-neutral-900 p-1">
          {(["capture", "browse"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setView({ kind: "list", tab: t })}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                activeTab === t
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t === "capture" ? "Capture" : "Browse"}
            </button>
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isCardDetail ? (
          <CardDetailPane
            noteId={(view as { kind: "card-detail"; noteId: string }).noteId}
          />
        ) : activeTab === "capture" ? (
          <CaptureView init={init} onOpenCard={openCard} />
        ) : (
          <BoardBrowserView onOpenCard={openCard} />
        )}
      </div>

    </div>
  );
}

// ── Shell header ──────────────────────────────────────────────────────────────

function ShellHeader({
  isDevMode = false,
  isCardDetail = false,
  onBack,
}: {
  isDevMode?: boolean;
  isCardDetail?: boolean;
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/8 bg-neutral-900 px-3 py-2.5">
      {isCardDetail && onBack && (
        <button
          onClick={onBack}
          className="mr-0.5 flex items-center gap-1 rounded px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          ← Back
        </button>
      )}
      {!isCardDetail && <span className="text-sm">✉️</span>}
      <span className="text-sm font-semibold">
        {isCardDetail ? "Card Details" : "NotesBoard"}
      </span>
      {isDevMode && !isCardDetail && (
        <span className="ml-auto rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
          dev
        </span>
      )}
    </div>
  );
}
