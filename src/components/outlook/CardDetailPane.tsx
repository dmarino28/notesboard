"use client";

import { useEffect, useRef, useState } from "react";
import { getNote, updateNote } from "@/lib/notes";
import { getNotePlacements, movePlacement, type NotePlacementInfo } from "@/lib/placements";
import {
  listEmailThreadsForNote,
  upsertEmailThreadForNote,
  type EmailThreadRow,
} from "@/lib/emailThreads";
import { listColumns, type ColumnRow } from "@/lib/columns";
import { type OutlookThread } from "@/lib/outlookContext";
import {
  fetchActionsForNotes,
  setNoteAction,
  cycleActionState,
  type ActionState,
} from "@/lib/userActions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Save status dot colours
const STATUS_DOT: Record<SaveStatus, string> = {
  idle:    "bg-transparent",
  pending: "bg-amber-400",
  saving:  "bg-indigo-400 animate-pulse",
  saved:   "bg-emerald-400",
  error:   "bg-red-400",
};

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  noteId: string;
  currentThread?: OutlookThread;
  /** When true, shows a brief "Opened via email thread" banner that auto-dismisses. */
  autoMatched?: boolean;
};

export function CardDetailPane({ noteId, currentThread, autoMatched }: Props) {
  // ── Content + save ────────────────────────────────────────────────────────────
  const [content, setContent]           = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading]           = useState(true);
  const [saveStatus, setSaveStatus]     = useState<SaveStatus>("idle");
  const [saveError, setSaveError]       = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Placements + move ─────────────────────────────────────────────────────────
  const [placements, setPlacements]                   = useState<NotePlacementInfo[]>([]);
  const [moveColumns, setMoveColumns]                 = useState<ColumnRow[]>([]);
  const [selectedMoveColumnId, setSelectedMoveColumnId] = useState("");
  const [moving, setMoving]                           = useState(false);
  const [moveMsg, setMoveMsg]                         = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // ── Linked threads ────────────────────────────────────────────────────────────
  const [threads, setThreads]             = useState<EmailThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [openError, setOpenError]         = useState<string | null>(null);
  const [threadOpenMode, setThreadOpenMode] = useState<Record<string, "conversation" | "message">>({});

  // ── Link-current state ────────────────────────────────────────────────────────
  const [linkCurrentState, setLinkCurrentState] = useState<"idle" | "linking" | "done" | "error">("idle");
  const [linkCurrentError, setLinkCurrentError] = useState<string | null>(null);

  // ── Auto-match banner ─────────────────────────────────────────────────────────
  const [showMatchBanner, setShowMatchBanner] = useState(autoMatched ?? false);

  // ── My Action (per-user, personal) ───────────────────────────────────────────
  const [addinActionState, setAddinActionState] = useState<ActionState | null>(null);
  const [addinPersonalDue, setAddinPersonalDue] = useState<string>("");
  const [addinActionSaving, setAddinActionSaving] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    setSaveStatus("idle");
    setSaveError(null);
    setLoading(true);

    async function load() {
      const [noteResult, placementsResult, threadsResult, actionResult] = await Promise.all([
        getNote(noteId),
        getNotePlacements(noteId),
        listEmailThreadsForNote(noteId),
        fetchActionsForNotes([noteId]),
      ]);

      // Restore action state (null = no action set)
      const action = actionResult[noteId];
      setAddinActionState(action?.action_state ?? null);
      setAddinPersonalDue("");

      const c = noteResult.data?.content ?? "";
      setContent(c);
      setSavedContent(c);
      setLoading(false);

      setPlacements(placementsResult);
      setThreads(threadsResult.data);
      setThreadsLoading(false);

      if (placementsResult.length > 0) {
        const { data: cols } = await listColumns(placementsResult[0].boardId);
        if (cols?.length) {
          setMoveColumns(cols);
          setSelectedMoveColumnId(placementsResult[0].columnId);
        }
      }
    }

    load();

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [noteId]);

  useEffect(() => {
    setLinkCurrentState("idle");
    setLinkCurrentError(null);
  }, [noteId]);

  // Auto-dismiss the "opened via email thread" banner after 3 seconds.
  useEffect(() => {
    if (!showMatchBanner) return;
    const t = setTimeout(() => setShowMatchBanner(false), 3_000);
    return () => clearTimeout(t);
  }, [showMatchBanner]);

  // ── Autosave ──────────────────────────────────────────────────────────────────
  function handleContentChange(newContent: string) {
    setContent(newContent);
    setSaveError(null);

    if (newContent === savedContent) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("idle");
      return;
    }

    setSaveStatus("pending");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void performSave(newContent);
    }, 1_400);
  }

  async function performSave(contentToSave: string) {
    setSaveStatus("saving");
    const { error } = await updateNote(noteId, contentToSave);
    if (error) {
      setSaveError(error);
      setSaveStatus("error");
    } else {
      setSavedContent(contentToSave);
      setSaveError(null);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2_500);
    }
  }

  function handleManualSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (content === savedContent && saveStatus !== "error") return;
    void performSave(content);
  }

  // ── Move ──────────────────────────────────────────────────────────────────────
  async function handleMove() {
    if (!placements[0] || !selectedMoveColumnId) return;
    if (selectedMoveColumnId === placements[0].columnId) return;
    setMoving(true);
    setMoveMsg(null);
    const { error } = await movePlacement(
      placements[0].placementId,
      placements[0].boardId,
      selectedMoveColumnId,
    );
    if (error) {
      setMoveMsg({ kind: "err", text: error });
    } else {
      const colName = moveColumns.find((c) => c.id === selectedMoveColumnId)?.name ?? "";
      setPlacements((prev) =>
        prev.map((p, i) =>
          i === 0 ? { ...p, columnId: selectedMoveColumnId, columnName: colName } : p,
        ),
      );
      setMoveMsg({ kind: "ok", text: `Moved to ${colName}` });
    }
    setMoving(false);
  }

  // ── Open thread ───────────────────────────────────────────────────────────────
  function openThreadInOutlook(thread: EmailThreadRow, mode: "conversation" | "message") {
    setOpenError(null);

    if (mode === "conversation") {
      if (!thread.conversation_id) {
        setOpenError("No conversation ID — cannot open this thread.");
        return;
      }
      console.log("[addin:openThread] conversation", thread.conversation_id);
      // displayConversationAsync is available in Mailbox requirement set 1.9+
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Office.context.mailbox as any).displayConversationAsync(
        thread.conversation_id,
        (result: Office.AsyncResult<void>) => {
          if (result.status === Office.AsyncResultStatus.Failed) {
            console.error("[addin:openThread] displayConversationAsync failed", result.error);
            setOpenError(`Could not open conversation: ${result.error.message}`);
          }
        },
      );
      return;
    }

    // message mode
    if (!thread.message_id) {
      setOpenError("No message ID — cannot open this message.");
      return;
    }
    console.log("[addin:openThread] message", thread.message_id);
    Office.context.mailbox.displayMessageForm(thread.message_id);
  }

  // ── Link current email ────────────────────────────────────────────────────────
  async function handleLinkCurrentEmail() {
    if (!currentThread) return;
    setLinkCurrentState("linking");
    setLinkCurrentError(null);
    const { data, error } = await upsertEmailThreadForNote({
      noteId,
      provider: currentThread.provider,
      conversationId: currentThread.conversationId,
      messageId: currentThread.messageId,
      webLink: currentThread.webLink,
      subject: currentThread.subject,
      mailbox: currentThread.mailbox,
      lastActivityAt: new Date().toISOString(),
    });
    if (error) {
      setLinkCurrentState("error");
      setLinkCurrentError(error);
    } else {
      if (data) {
        setThreads((prev) => {
          const exists = prev.some((t) => t.conversation_id === data.conversation_id);
          return exists
            ? prev.map((t) => (t.conversation_id === data.conversation_id ? data : t))
            : [...prev, data];
        });
      }
      setLinkCurrentState("done");
    }
  }

  // ── My Action handlers ────────────────────────────────────────────────────────
  async function handleCycleAction() {
    const next = cycleActionState(addinActionState);
    setAddinActionState(next === "none" ? null : next);
    setAddinActionSaving(true);
    await setNoteAction(noteId, next);
    setAddinActionSaving(false);
  }

  async function handlePersonalDueChange(value: string) {
    setAddinPersonalDue(value);
    if (!addinActionState) return; // only persist if there's an active state
    setAddinActionSaving(true);
    await setNoteAction(noteId, addinActionState);
    setAddinActionSaving(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const dirty = content !== savedContent;
  const isAlreadyLinked =
    currentThread !== undefined &&
    threads.some((t) => t.conversation_id === currentThread.conversationId);
  const linkButtonDisabled =
    isAlreadyLinked || linkCurrentState === "linking" || linkCurrentState === "done";

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-neutral-600">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="nb-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-4 pb-2">

          {/* Auto-match banner — fades out after 3 s */}
          {showMatchBanner && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-800/30 bg-sky-950/20 px-3 py-2">
              <span className="text-[11px] text-sky-500">✉</span>
              <p className="flex-1 text-xs text-sky-400">Opened via email thread</p>
              <button
                type="button"
                onClick={() => setShowMatchBanner(false)}
                className="flex-shrink-0 cursor-pointer text-[10px] text-sky-700 hover:text-sky-500"
              >
                ✕
              </button>
            </div>
          )}

          {/* Content editor */}
          <section className="space-y-1.5">
            <SectionLabel>Content</SectionLabel>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleManualSave();
                }
              }}
              rows={7}
              placeholder="Add notes…"
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-neutral-900 px-3 py-2.5 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-700 transition-colors duration-150 focus:border-white/[0.18] focus:bg-neutral-900"
            />
          </section>

          {/* My Action — per-user, invisible to others */}
          <section className="space-y-2">
            <SectionLabel>My Action</SectionLabel>
            <div className="flex items-center gap-2">
              {/* Cycle button */}
              <button
                type="button"
                onClick={() => void handleCycleAction()}
                disabled={addinActionSaving}
                title={addinActionState ? `${addinActionState.replace("_", " ")} — click to cycle` : "Mark as needs action"}
                className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors duration-150 hover:border-white/[0.14] hover:text-neutral-100 disabled:opacity-50 cursor-pointer"
              >
                <span className={`block h-2 w-2 flex-shrink-0 rounded-full ${
                  addinActionState === "needs_action" ? "bg-orange-500" :
                  addinActionState === "waiting"      ? "bg-sky-500" :
                  addinActionState === "done"         ? "bg-emerald-500" :
                  "bg-neutral-600"
                }`} />
                {addinActionState
                  ? addinActionState.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
                  : "No action"}
              </button>
              {addinActionSaving && (
                <span className="text-[10px] text-neutral-600">Saving…</span>
              )}
            </div>
            {/* Personal due date (only shown when an action state is active) */}
            {addinActionState && addinActionState !== "done" && (
              <input
                type="date"
                value={addinPersonalDue}
                onChange={(e) => void handlePersonalDueChange(e.target.value)}
                disabled={addinActionSaving}
                className="w-full rounded-lg border border-white/[0.08] bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-300 outline-none focus:border-indigo-500/40 disabled:opacity-50 cursor-pointer"
                title="Personal due date (only visible to you)"
              />
            )}
          </section>

          {/* Placement info + move */}
          {placements.length > 0 && (
            <section className="space-y-2">
              <SectionLabel>Location</SectionLabel>
              <div className="rounded-xl border border-white/[0.07] bg-neutral-900/70 px-3 py-2.5 space-y-2">
                {placements.map((p) => (
                  <p key={p.placementId} className="text-xs text-neutral-400">
                    <span className="text-neutral-300 font-medium">{p.boardName}</span>
                    <span className="mx-1 text-neutral-700">›</span>
                    <span className="text-neutral-400">{p.columnName}</span>
                  </p>
                ))}
                {moveColumns.length > 1 && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <select
                      value={selectedMoveColumnId}
                      onChange={(e) => { setSelectedMoveColumnId(e.target.value); setMoveMsg(null); }}
                      className="flex-1 rounded-lg border border-white/[0.08] bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-white/[0.16] cursor-pointer"
                    >
                      {moveColumns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleMove}
                      disabled={moving || selectedMoveColumnId === placements[0]?.columnId}
                      className="cursor-pointer rounded-lg border border-white/[0.08] bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors duration-150 hover:bg-neutral-700 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {moving ? "…" : "Move"}
                    </button>
                  </div>
                )}
                {moveMsg && (
                  <p className={`text-xs ${moveMsg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                    {moveMsg.text}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Linked email threads */}
          <section className="space-y-2">
            <SectionLabel>Linked Emails</SectionLabel>

            {threadsLoading ? (
              <p className="text-xs text-neutral-700">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="text-xs text-neutral-700">No linked threads yet.</p>
            ) : (
              <ul className="space-y-2">
                {threads.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-xl border border-white/[0.07] bg-neutral-900/70 px-3 py-2.5 space-y-1.5"
                  >
                    <p className="line-clamp-1 text-sm font-medium text-neutral-200">
                      {t.subject || "(no subject)"}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                      {t.mailbox && <span className="truncate">{t.mailbox}</span>}
                      {t.last_activity_at && (
                        <>
                          <span>·</span>
                          <span>{relativeTime(t.last_activity_at)}</span>
                        </>
                      )}
                    </div>
                    {/* Conversation / Message toggle */}
                    <div className="flex items-center rounded border border-white/[0.07] overflow-hidden w-fit">
                      {(["conversation", "message"] as const).map((m) => {
                        const active = (threadOpenMode[t.id] ?? "conversation") === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setThreadOpenMode((prev) => ({ ...prev, [t.id]: m }))}
                            className={`px-2 py-0.5 text-[10px] capitalize transition-colors cursor-pointer ${
                              active
                                ? "bg-white/[0.10] text-neutral-300"
                                : "text-neutral-600 hover:text-neutral-400"
                            }`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => openThreadInOutlook(t, threadOpenMode[t.id] ?? "conversation")}
                      className="w-full cursor-pointer rounded-lg bg-neutral-800 px-2.5 py-1.5 text-left text-xs font-medium text-neutral-400 transition-colors duration-150 hover:bg-neutral-700 hover:text-neutral-200 active:bg-neutral-600"
                    >
                      Open in Outlook →
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Open error */}
            {openError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2.5">
                <p className="flex-1 text-xs text-red-400">{openError}</p>
                <button
                  type="button"
                  onClick={() => setOpenError(null)}
                  className="flex-shrink-0 cursor-pointer text-xs text-red-700 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Link current email */}
            {currentThread && !threadsLoading && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleLinkCurrentEmail}
                  disabled={linkButtonDisabled}
                  className={`w-full cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed ${
                    isAlreadyLinked || linkCurrentState === "done"
                      ? "border-emerald-800/40 bg-emerald-950/30 text-emerald-400"
                      : "border-white/[0.08] bg-neutral-900 text-neutral-400 hover:border-white/[0.14] hover:text-neutral-200 disabled:opacity-50"
                  }`}
                >
                  {isAlreadyLinked || linkCurrentState === "done"
                    ? "Linked to this card ✓"
                    : linkCurrentState === "linking"
                    ? "Linking…"
                    : "Link this email to card"}
                </button>
                {linkCurrentError && (
                  <p className="mt-1.5 text-xs text-red-400">{linkCurrentError}</p>
                )}
              </div>
            )}
          </section>

          {/* Bottom padding so sticky footer doesn't cover last item */}
          <div className="h-2" />
        </div>
      </div>

      {/* ── Sticky save footer ────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-white/[0.07] bg-neutral-950 px-4 py-2.5">
        {/* Status indicator */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors duration-300 ${STATUS_DOT[saveStatus]}`} />
          <span className="truncate text-xs text-neutral-600">
            {saveStatus === "idle"    && (dirty ? "Unsaved changes" : "Saved")}
            {saveStatus === "pending" && "Modified — autosaving…"}
            {saveStatus === "saving"  && "Saving…"}
            {saveStatus === "saved"   && "Saved ✓"}
            {saveStatus === "error"   && (saveError ?? "Save failed")}
          </span>
        </div>

        {/* Manual save button */}
        <button
          type="button"
          onClick={handleManualSave}
          disabled={saveStatus === "saving" || (!dirty && saveStatus !== "error")}
          className="flex-shrink-0 cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
      </div>

    </div>
  );
}
