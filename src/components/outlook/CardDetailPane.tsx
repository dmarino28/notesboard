"use client";

import { useEffect, useState } from "react";
import { getNote, updateNote } from "@/lib/notes";
import { getNotePlacements, movePlacement, type NotePlacementInfo } from "@/lib/placements";
import {
  listEmailThreadsForNote,
  upsertEmailThreadForNote,
  type EmailThreadRow,
} from "@/lib/emailThreads";
import { listColumns, type ColumnRow } from "@/lib/columns";
import { type OutlookThread } from "@/lib/outlookContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function openBrowserUrl(url: string) {
  if (typeof Office !== "undefined") {
    try { Office.context.ui.openBrowserWindow(url); return; } catch {}
  }
  window.open(url, "_blank");
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Returns the OWA base URL for a mailbox address. */
function owaBase(mailbox: string | null): string {
  const domain = (mailbox ?? "").split("@")[1]?.toLowerCase() ?? "";
  const isConsumer = ["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain);
  return isConsumer ? "https://outlook.live.com" : "https://outlook.office.com";
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  noteId: string;
  /** The active email thread from Outlook context, used for "Link current email" feature. */
  currentThread?: OutlookThread;
};

export function CardDetailPane({ noteId, currentThread }: Props) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [placements, setPlacements] = useState<NotePlacementInfo[]>([]);
  const [moveColumns, setMoveColumns] = useState<ColumnRow[]>([]);
  const [selectedMoveColumnId, setSelectedMoveColumnId] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveMsg, setMoveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [threads, setThreads] = useState<EmailThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);

  // Toast error for "Open in Outlook" failures
  const [openError, setOpenError] = useState<string | null>(null);

  // "Link current email to this card" state
  const [linkCurrentState, setLinkCurrentState] = useState<"idle" | "linking" | "done" | "error">("idle");
  const [linkCurrentError, setLinkCurrentError] = useState<string | null>(null);

  // ── Load all card data ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [noteResult, placementsResult, threadsResult] = await Promise.all([
        getNote(noteId),
        getNotePlacements(noteId),
        listEmailThreadsForNote(noteId),
      ]);

      const c = noteResult.data?.content ?? "";
      setContent(c);
      setSavedContent(c);
      setLoading(false);

      setPlacements(placementsResult);
      setThreads(threadsResult.data);
      setThreadsLoading(false);

      // Load columns for the first placement's board (move dropdown)
      if (placementsResult.length > 0) {
        const { data: cols } = await listColumns(placementsResult[0].boardId);
        if (cols?.length) {
          setMoveColumns(cols);
          setSelectedMoveColumnId(placementsResult[0].columnId);
        }
      }
    }
    load();
  }, [noteId]);

  // Reset link-current state when the card changes
  useEffect(() => {
    setLinkCurrentState("idle");
    setLinkCurrentError(null);
  }, [noteId]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const { error } = await updateNote(noteId, content);
    if (error) {
      setSaveError(error);
    } else {
      setSavedContent(content);
    }
    setSaving(false);
  }

  // ── Move card ─────────────────────────────────────────────────────────────────
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
      setMoveMsg({ kind: "ok", text: `Moved to ${colName}.` });
    }
    setMoving(false);
  }

  // ── Open thread in Outlook ────────────────────────────────────────────────────
  /**
   * Opens the email thread in Outlook as a search results view so the user sees
   * the full conversation chain rather than a single message.
   *
   * Priority:
   *   1. web_link (Phase 3 Graph deep-link) — opens conversation view directly.
   *   2. OWA search by quoted subject — surfaces the full thread in search results.
   *      Consumer accounts → outlook.live.com; enterprise → outlook.office.com.
   *   3. No subject: show inline error toast. Never open generic inbox.
   */
  function openThreadInOutlook(thread: EmailThreadRow) {
    setOpenError(null);

    // Path 1: Phase 3 Graph API conversation deep-link
    if (thread.web_link) {
      openBrowserUrl(thread.web_link);
      return;
    }

    // Path 2: OWA search by quoted subject → shows full conversation chain
    const subject = thread.subject?.trim() ?? "";
    if (!subject) {
      setOpenError(
        "Can't open this thread — no subject to search by. Find it manually in Outlook.",
      );
      return;
    }
    const url = `${owaBase(thread.mailbox)}/mail/search?q=${encodeURIComponent(`"${subject}"`)}`;
    openBrowserUrl(url);
  }

  // ── Link current email to this card ──────────────────────────────────────────
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
          // Replace if already in list (upsert may return existing), otherwise append
          const exists = prev.some((t) => t.conversation_id === data.conversation_id);
          return exists
            ? prev.map((t) => (t.conversation_id === data.conversation_id ? data : t))
            : [...prev, data];
        });
      }
      setLinkCurrentState("done");
    }
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
        <p className="text-xs text-neutral-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4">

        {/* Content editor */}
        <div className="space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm leading-relaxed text-neutral-200 outline-none focus:border-neutral-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="cursor-pointer rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {!dirty && !saving && savedContent && (
              <span className="text-xs text-neutral-600">Saved</span>
            )}
            {saveError && <span className="text-xs text-red-400">{saveError}</span>}
          </div>
        </div>

        {/* Placement info + move */}
        {placements.length > 0 && (
          <div className="space-y-2 rounded-lg border border-white/8 bg-neutral-900/60 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              Placement{placements.length > 1 ? "s" : ""}
            </p>
            {placements.map((p, i) => (
              <p key={p.placementId} className="text-xs text-neutral-400">
                {i > 0 && <span className="text-neutral-600">&amp; </span>}
                <span className="text-neutral-300">{p.boardName}</span>
                <span className="text-neutral-600"> › </span>
                <span className="text-neutral-300">{p.columnName}</span>
              </p>
            ))}

            {/* Move dropdown (first placement only) */}
            {moveColumns.length > 1 && (
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={selectedMoveColumnId}
                  onChange={(e) => { setSelectedMoveColumnId(e.target.value); setMoveMsg(null); }}
                  className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-500"
                >
                  {moveColumns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleMove}
                  disabled={moving || selectedMoveColumnId === placements[0]?.columnId}
                  className="cursor-pointer rounded bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {moving ? "Moving…" : "Move"}
                </button>
              </div>
            )}
            {moveMsg && (
              <p className={`text-xs ${moveMsg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                {moveMsg.text}
              </p>
            )}
          </div>
        )}

        {/* Linked email threads */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            Linked Emails
          </p>

          {threadsLoading ? (
            <p className="text-xs text-neutral-600">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="text-xs text-neutral-600">No linked email threads.</p>
          ) : (
            <ul className="space-y-2">
              {threads.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-white/8 bg-neutral-900/60 px-3 py-2.5"
                >
                  <p className="line-clamp-1 text-sm font-medium text-neutral-200">
                    {t.subject || "(no subject)"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                    {t.mailbox && <span className="truncate">{t.mailbox}</span>}
                    {t.last_activity_at && (
                      <>
                        <span>·</span>
                        <span>{relativeTime(t.last_activity_at)}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openThreadInOutlook(t)}
                    className="mt-2 w-full cursor-pointer rounded bg-neutral-800 px-2.5 py-1.5 text-left text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
                  >
                    Open in Outlook →
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Open error toast */}
          {openError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2.5">
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

          {/* Link current email to this card */}
          {currentThread && !threadsLoading && (
            <div className="mt-3 border-t border-white/8 pt-3">
              <button
                type="button"
                onClick={handleLinkCurrentEmail}
                disabled={linkButtonDisabled}
                className="w-full cursor-pointer rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAlreadyLinked || linkCurrentState === "done"
                  ? "Already linked ✓"
                  : linkCurrentState === "linking"
                  ? "Linking…"
                  : "Link current email to this card"}
              </button>
              {linkCurrentError && (
                <p className="mt-1 text-xs text-red-400">{linkCurrentError}</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
