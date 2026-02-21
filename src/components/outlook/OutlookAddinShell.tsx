"use client";

import { useEffect, useState } from "react";
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

type Props = { init: ReadItemResult };

export function OutlookAddinShell({ init }: Props) {
  const isDevMode = init.kind === "no_office";
  const thread = init.kind === "ok" ? init.thread : DEV_THREAD;

  const [view, setView] = useState<ViewState>({ kind: "list", tab: "capture" });

  // linkingCtx is set while the user is in "pick a card to link this email" mode.
  const [linkingCtx, setLinkingCtx] = useState<OutlookThread | null>(null);

  // ── Pin hint (shown once, dismissed to localStorage) ─────────────────────────
  const [showPinHint, setShowPinHint] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("nb_pin_hint_dismissed")) setShowPinHint(true);
    } catch {}
  }, []);

  function dismissPinHint() {
    try { localStorage.setItem("nb_pin_hint_dismissed", "1"); } catch {}
    setShowPinHint(false);
  }

  // ── Navigation helpers ────────────────────────────────────────────────────────
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
    // Switching away from browse while linking cancels the linking flow.
    if (linkingCtx && newTab !== "browse") setLinkingCtx(null);
    setView({ kind: "list", tab: newTab });
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

      {/* Header */}
      <ShellHeader isDevMode={isDevMode} isCardDetail={isCardDetail} onBack={goBack} />

      {/* Pin hint — shown once in real Outlook context */}
      {showPinHint && !isDevMode && !isCardDetail && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/5 bg-neutral-900/60 px-3 py-1.5">
          <p className="flex-1 text-[10px] text-neutral-500">
            Tip: Pin this pane to keep NotesBoard open while switching emails.
          </p>
          <button
            type="button"
            onClick={dismissPinHint}
            className="flex-shrink-0 cursor-pointer text-[10px] text-neutral-600 hover:text-neutral-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab bar (hidden during card-detail) */}
      {!isCardDetail && (
        <div className="flex flex-shrink-0 gap-0.5 border-b border-white/8 bg-neutral-900 p-1">
          {(["capture", "browse"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTabChange(t)}
              className={`flex-1 cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors ${
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

      {/* Main content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isCardDetail ? (
          <CardDetailPane
            noteId={(view as { kind: "card-detail"; noteId: string }).noteId}
            currentThread={thread}
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
          type="button"
          onClick={onBack}
          className="mr-0.5 flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
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
