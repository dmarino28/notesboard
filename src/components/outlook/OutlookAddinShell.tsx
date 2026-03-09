"use client";

import { useEffect, useState } from "react";
import { type ReadItemResult, type OutlookThread } from "@/lib/outlookContext";
import {
  listThreadLinksByConversationId,
  type ThreadLink,
} from "@/lib/emailThreads";
import { STATUS_META, STATUS_VALUES, type NoteStatus } from "@/lib/collab";
import { BoardBrowserView } from "./BoardBrowserView";
import { CaptureView } from "./CaptureView";
import { CardDetailPane } from "./CardDetailPane";
import { ThreadMatchChooser } from "./ThreadMatchChooser";

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
  | { kind: "card-detail"; noteId: string; returnTab: Tab; autoMatched?: boolean };

// Resolved state from the thread-link lookup.
type ThreadCtxState =
  | { kind: "idle" }                        // no thread (no email open)
  | { kind: "loading" }                     // lookup in flight
  | { kind: "none" }                        // looked up — no matches
  | { kind: "one"; match: ThreadLink }      // exactly one card matched
  | { kind: "many"; matches: ThreadLink[] }; // multiple cards matched

type Props = { init: ReadItemResult; currentThread: OutlookThread | null };

export function OutlookAddinShell({ init, currentThread }: Props) {
  const isDevMode = init.kind === "no_office";
  const thread: OutlookThread | null = isDevMode ? DEV_THREAD : currentThread;

  const [view, setView] = useState<ViewState>({ kind: "list", tab: "capture" });
  const [linkingCtx, setLinkingCtx] = useState<OutlookThread | null>(null);
  const [threadCtx, setThreadCtx] = useState<ThreadCtxState>({ kind: "idle" });

  // ── Thread context lookup ──────────────────────────────────────────────────
  // Runs whenever the open email changes (conversationId key).
  // Resolves to one of: none / one / many.
  // For a single match on the capture tab, also auto-navigates to the card.
  useEffect(() => {
    if (!thread) {
      setThreadCtx({ kind: "idle" });
      return;
    }
    setThreadCtx({ kind: "loading" });
    let cancelled = false;

    listThreadLinksByConversationId(thread.conversationId).then((matches) => {
      if (cancelled) return;

      if (matches.length === 0) {
        setThreadCtx({ kind: "none" });
        return;
      }

      if (matches.length === 1) {
        setThreadCtx({ kind: "one", match: matches[0] });
        // Auto-navigate only when the user is on the capture tab.
        // Batched with setThreadCtx — no intermediate render.
        setView((currentView) => {
          if (currentView.kind === "list" && currentView.tab === "capture") {
            return {
              kind: "card-detail",
              noteId: matches[0].noteId,
              returnTab: "capture",
              autoMatched: true,
            };
          }
          return currentView; // don't interrupt browse or card-detail
        });
        return;
      }

      setThreadCtx({ kind: "many", matches });
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.conversationId]);

  // ── Navigation ────────────────────────────────────────────────────────────
  function openCard(noteId: string, autoMatched = false) {
    const returnTab: Tab = view.kind === "list" ? view.tab : "browse";
    setLinkingCtx(null);
    setView({ kind: "card-detail", noteId, returnTab, autoMatched });
  }

  function goBack() {
    if (view.kind === "card-detail") {
      setView({ kind: "list", tab: view.returnTab });
    }
  }

  // ── Linking flow ──────────────────────────────────────────────────────────
  function startLinking() {
    if (!thread) return;
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

  // ── Error state ───────────────────────────────────────────────────────────
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

  // ── Capture tab body ───────────────────────────────────────────────────────
  // Determined by threadCtx: loading → spinner, one → single-match view,
  // many → chooser, none/idle → standard capture form.
  function renderCaptureBody() {
    if (threadCtx.kind === "loading") {
      return <ThreadLoadingView thread={thread} />;
    }
    if (threadCtx.kind === "many") {
      return (
        <ThreadMatchChooser
          thread={thread}
          matches={threadCtx.matches}
          onOpenCard={(noteId) => openCard(noteId)}
          onStartLinking={startLinking}
        />
      );
    }
    if (threadCtx.kind === "one") {
      // User pressed Back from the auto-navigated card — show a lightweight
      // single-match view so they can re-open it or start a fresh capture.
      return (
        <SingleMatchView
          thread={thread}
          match={threadCtx.match}
          onOpenCard={(noteId) => openCard(noteId)}
          onStartLinking={startLinking}
        />
      );
    }
    // "none" or "idle"
    return (
      <CaptureView
        thread={thread}
        isDevMode={isDevMode}
        onOpenCard={openCard}
        onStartLinking={startLinking}
      />
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
        {isCardDetail && view.kind === "card-detail" ? (
          <CardDetailPane
            noteId={view.noteId}
            currentThread={thread ?? undefined}
            autoMatched={view.autoMatched}
          />
        ) : activeTab === "capture" ? (
          renderCaptureBody()
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

// ── Thread context inline views ───────────────────────────────────────────────

// Shown while the conversationId lookup is in flight.
function ThreadLoadingView({ thread }: { thread: OutlookThread | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 border-b border-white/[0.07] px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100">
          {thread?.subject || "(no subject)"}
        </p>
        {thread?.mailbox && (
          <p className="truncate text-xs text-neutral-600">{thread.mailbox}</p>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-neutral-700">Checking for linked cards…</p>
      </div>
    </div>
  );
}

// Shown after the user presses Back from an auto-matched card (single match).
// Auto-navigation already fired; this is the re-entry point.
function SingleMatchView({
  thread,
  match,
  onOpenCard,
  onStartLinking,
}: {
  thread: OutlookThread | null;
  match: ThreadLink;
  onOpenCard: (noteId: string) => void;
  onStartLinking: () => void;
}) {
  const meta =
    match.status && STATUS_VALUES.includes(match.status as NoteStatus)
      ? STATUS_META[match.status as NoteStatus]
      : null;

  return (
    <div className="flex h-full flex-col">
      {/* Thread identity */}
      <div className="flex-shrink-0 border-b border-white/[0.07] px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100">
          {thread?.subject || "(no subject)"}
        </p>
        {thread?.mailbox && (
          <p className="truncate text-xs text-neutral-600">{thread.mailbox}</p>
        )}
      </div>

      {/* Scrollable body */}
      <div className="nb-scroll flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-xs text-neutral-500">This thread is linked to a card.</p>

        <button
          type="button"
          onClick={() => onOpenCard(match.noteId)}
          className="w-full cursor-pointer rounded-xl border border-white/[0.08] bg-neutral-900/70 px-3 py-2.5 text-left transition-colors hover:border-white/[0.16] hover:bg-neutral-900"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-neutral-100">
              {match.noteTitle || "(untitled)"}
            </p>
            <span className="mt-0.5 flex-shrink-0 text-neutral-600">→</span>
          </div>
          {(match.boardName || meta) && (
            <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
              {match.boardName && <span>{match.boardName}</span>}
              {meta && (
                <>
                  <span>·</span>
                  <span className={meta.badgeClass.split(" ")[1]}>{meta.label}</span>
                </>
              )}
            </div>
          )}
        </button>

        <div className="border-t border-white/[0.06] pt-1">
          <button
            type="button"
            onClick={onStartLinking}
            className="w-full cursor-pointer rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:border-white/[0.14] hover:text-neutral-300"
          >
            Link to a different card →
          </button>
        </div>
      </div>
    </div>
  );
}
