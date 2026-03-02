"use client";

import { useState } from "react";
import { type ReadItemResult, type OutlookThread } from "@/lib/outlookContext";
import { BoardBrowserView } from "./BoardBrowserView";
import { CaptureView } from "./CaptureView";
import { CardDetailPane } from "./CardDetailPane";

const DEV_THREAD: OutlookThread = {
  conversationId: "dummy-conv-dev-001",
  messageId: "dummy-msg-dev-001",
  webLink: null,
  subject: "Dev Mode — Q1 Planning Discussion",
  provider: "outlook",
  mailbox: "dev@example.com",
};

type Tab = "capture" | "browse";
type ViewState =
  | { kind: "list"; tab: Tab }
  | { kind: "card-detail"; noteId: string; returnTab: Tab };

type Props = { init: ReadItemResult; currentThread: OutlookThread | null };

export function OutlookAddinShell({ init, currentThread }: Props) {
  const isDevMode = init.kind === "no_office";
  // In dev mode use the stub; otherwise use the live thread from page.tsx
  // (updated on every ItemChanged event). May be null when no message is selected.
  const thread: OutlookThread | null = isDevMode ? DEV_THREAD : currentThread;

  const [view, setView] = useState<ViewState>({ kind: "list", tab: "capture" });
  const [linkingCtx, setLinkingCtx] = useState<OutlookThread | null>(null);

  // ── Navigation ────────────────────────────────────────────────────────────────
  function openCard(noteId: string) {
    const returnTab: Tab = view.kind === "list" ? view.tab : "browse";
    setLinkingCtx(null);
    setView({ kind: "card-detail", noteId, returnTab });
  }

  function goBack() {
    if (view.kind === "card-detail") {
      setView({ kind: "list", tab: view.returnTab });
    }
  }

  // ── Linking flow ──────────────────────────────────────────────────────────────
  function startLinking() {
    if (!thread) return; // no message selected — guard before entering linking mode
    setLinkingCtx(thread);
    setView({ kind: "list", tab: "browse" });
  }

  function handleLinkCreated(noteId: string) {
    setLinkingCtx(null);
    setView({ kind: "card-detail", noteId, returnTab: "capture" });
  }

  function cancelLinking() {
    setLinkingCtx(null);
    setView({ kind: "list", tab: "capture" });
  }

  function handleTabChange(newTab: Tab) {
    if (linkingCtx && newTab !== "browse") setLinkingCtx(null);
    setView({ kind: "list", tab: newTab });
  }

  const isCardDetail = view.kind === "card-detail";
  const activeTab: Tab = view.kind === "list" ? view.tab : "capture";

  // ── Error state ───────────────────────────────────────────────────────────────
  if (init.kind === "error") {
    return (
      <div className="nb-addin flex h-screen flex-col bg-neutral-950 text-neutral-200">
        <AddinHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900">
            <span className="text-lg">⚠️</span>
          </div>
          <p className="text-sm leading-relaxed text-neutral-400">{init.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nb-addin flex h-screen flex-col bg-neutral-950 text-neutral-100">

      {/* App chrome */}
      <AddinHeader isDevMode={isDevMode} isCardDetail={isCardDetail} onBack={goBack} />

      {/* Tab bar — hidden when viewing a card */}
      {!isCardDetail && (
        <div className="flex flex-shrink-0 gap-1 border-b border-white/[0.07] bg-neutral-950 px-2 py-1.5">
          {(["capture", "browse"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTabChange(t)}
              className={`flex-1 cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors duration-150 ${
                activeTab === t
                  ? "bg-neutral-800 text-neutral-100 shadow-sm"
                  : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300"
              }`}
            >
              {t === "capture" ? "Capture" : "Browse"}
            </button>
          ))}
        </div>
      )}

      {/* Main content area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isCardDetail ? (
          <CardDetailPane
            noteId={(view as { kind: "card-detail"; noteId: string }).noteId}
            currentThread={thread ?? undefined}
          />
        ) : activeTab === "capture" ? (
          <CaptureView
            thread={thread}
            isDevMode={isDevMode}
            onOpenCard={openCard}
            onStartLinking={startLinking}
          />
        ) : (
          <BoardBrowserView
            onOpenCard={openCard}
            linkingThread={linkingCtx}
            onLinkCreated={handleLinkCreated}
            onCancelLinking={cancelLinking}
          />
        )}
      </div>

    </div>
  );
}

// ── Shared header ─────────────────────────────────────────────────────────────

function AddinHeader({
  isDevMode = false,
  isCardDetail = false,
  onBack,
}: {
  isDevMode?: boolean;
  isCardDetail?: boolean;
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-white/[0.07] bg-neutral-950 px-2.5 py-2">
      {isCardDetail && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-neutral-200 active:bg-white/[0.1]"
        >
          <span className="text-[11px]">←</span>
          <span>Back</span>
        </button>
      ) : (
        <span className="flex h-5 w-5 items-center justify-center text-sm leading-none">✉️</span>
      )}

      <span className="text-[13px] font-semibold tracking-tight text-neutral-100">
        {isCardDetail ? "Card" : "NotesBoard"}
      </span>

      {isDevMode && !isCardDetail && (
        <span className="ml-auto rounded-md bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400/80 ring-1 ring-amber-800/40">
          dev
        </span>
      )}
    </div>
  );
}
