"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useActions } from "@/lib/ActionContext";
import type { ActionState, ActionMode, TagDef } from "@/lib/userActions";
import { NoteFieldUpdates, updateNoteFields, deleteNote } from "@/lib/notes";
import {
  LabelRow,
  listNoteLabels,
  attachLabel,
  detachLabel,
  createLabel,
} from "@/lib/labels";
import { CommentRow, listComments, addComment, deleteComment } from "@/lib/comments";
import { ColumnRow, listColumns } from "@/lib/columns";
import { BoardRow } from "@/lib/boards";
import {
  EmailThreadRow,
  AttachmentRow,
  listEmailThreadsForNote,
  deleteEmailThread,
  listAttachmentsForThread,
} from "@/lib/emailThreads";
import { acquireMailToken } from "@/lib/msalConfig";
import { LABEL_PALETTE } from "@/lib/palette";
import {
  CollabData,
  NoteActivity,
  NoteStatus,
  NoteUpdate,
  STATUS_META,
  STATUS_VALUES,
  listCollab,
  postNoteUpdate,
} from "@/lib/collab";

// Minimal shape the modal needs from a note — works for both NoteRow and PlacedNoteRow
type NoteInput = {
  content: string;
  description: string | null;
  due_date: string | null;
  event_start: string | null;
  event_end: string | null;
  archived: boolean;
  board_id: string;
  status: string | null;
};

type Props = {
  note: NoteInput;
  noteId: string;           // canonical note id (use this for all DB calls)
  boardId: string;
  boardLabels: LabelRow[];
  boards?: BoardRow[];      // if provided, enables "Link to board" UI
  onClose: () => void;
  onNoteChange: (noteId: string, fields: Partial<NoteInput>) => void;
  onLabelCreated: (label: LabelRow) => void;
  onNoteLabelsChanged: (noteId: string, labels: LabelRow[]) => void;
  onError: (msg: string) => void;
  onDeleteEverywhere?: (noteId: string) => Promise<void>;
  onLinkToBoard?: (noteId: string, targetBoardId: string, targetColumnId: string) => Promise<void>;
  onNoteDeleted?: (noteId: string) => void;
  onEmailThreadsChanged?: () => void;
};

export function CardDetailsModal({
  note,
  noteId,
  boardId,
  boardLabels,
  boards,
  onClose,
  onNoteChange,
  onLabelCreated,
  onNoteLabelsChanged,
  onError,
  onDeleteEverywhere,
  onLinkToBoard,
  onNoteDeleted,
  onEmailThreadsChanged,
}: Props) {
  // --- Personal action (from context) ---
  const {
    actionMap,
    tagDefs,
    onActionChange,
    onTagsChange,
    onModeChange,
    onDueDateChange: onPersonalDueDateChange,
    onCreateTagDef,
  } = useActions();
  const currAction = (actionMap[noteId]?.action_state ?? null) as ActionState | null;
  const currMode: ActionMode = actionMap[noteId]?.action_mode ?? "timed";
  const currTags = actionMap[noteId]?.private_tags ?? [];
  const currPersonalDue = actionMap[noteId]?.personal_due_date ?? null;

  // --- Local field state ---
  const [title, setTitle] = useState(note.content);
  const [description, setDescription] = useState(note.description ?? "");
  const [dueDate, setDueDate] = useState(
    note.due_date ? toDatetimeLocal(note.due_date) : "",
  );
  const [eventStart, setEventStart] = useState(
    note.event_start ? toDatetimeLocal(note.event_start) : "",
  );
  const [eventEnd, setEventEnd] = useState(
    note.event_end ? toDatetimeLocal(note.event_end) : "",
  );
  const [archived, setArchived] = useState(note.archived);

  // --- Labels ---
  const [noteLabels, setNoteLabels] = useState<LabelRow[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [creatingLabel, setCreatingLabel] = useState(false);

  // --- Comments ---
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [addingComment, setAddingComment] = useState(false);

  // --- Email threads ---
  const [emailThreads, setEmailThreads] = useState<EmailThreadRow[]>([]);
  const [emailThreadsLoading, setEmailThreadsLoading] = useState(true);
  // Attachments keyed by thread_id, loaded lazily per thread
  const [attachmentMap, setAttachmentMap] = useState<Record<string, AttachmentRow[]>>({});
  // Thread being connected via MSAL (shows "Connecting…" on its button)
  const [connectingThreadId, setConnectingThreadId] = useState<string | null>(null);
  // Thread for which a redirect-based sign-in was started (page will navigate away)
  const [emailSignInRedirecting, setEmailSignInRedirecting] = useState<string | null>(null);
  // Inline error shown under a specific thread row (cleared on next attempt)
  const [emailOpenError, setEmailOpenError] = useState<{ threadId: string; msg: string } | null>(null);
  // Per-thread open mode: "conversation" (default) or "message"
  const [threadOpenMode, setThreadOpenMode] = useState<Record<string, "conversation" | "message">>({});

  // --- Status ---
  const [status, setStatus] = useState<NoteStatus | null>(
    (note.status as NoteStatus | null) ?? null,
  );

  // --- Collab (updates + activity) ---
  const [updates, setUpdates] = useState<NoteUpdate[]>([]);
  const [activity, setActivity] = useState<NoteActivity[]>([]);
  const [collabLoading, setCollabLoading] = useState(true);
  const [collabAuthed, setCollabAuthed] = useState<boolean | null>(null); // null=loading, false=unauthed
  const [newUpdate, setNewUpdate] = useState("");
  const [updateStatusChange, setUpdateStatusChange] = useState<NoteStatus | null>(null);
  const [postingUpdate, setPostingUpdate] = useState(false);

  // --- Debounced save ---
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<NoteFieldUpdates>({});

  // --- Animation ---
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Link to board state ---
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkBoardId, setLinkBoardId] = useState("");
  const [linkColumns, setLinkColumns] = useState<ColumnRow[]>([]);
  const [linkColumnId, setLinkColumnId] = useState("");
  const [linkColumnsLoading, setLinkColumnsLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Lazy-load labels, comments, email threads, and collab data
  useEffect(() => {
    listNoteLabels(noteId).then(({ data }) => {
      setNoteLabels(data);
      setLabelsLoading(false);
    });
    listComments(noteId).then(({ data }) => {
      setComments(data);
      setCommentsLoading(false);
    });
    listEmailThreadsForNote(noteId).then(({ data }) => {
      setEmailThreads(data);
      setEmailThreadsLoading(false);
    });
    listCollab(noteId).then((data) => {
      if (data === null) {
        setCollabAuthed(false);
      } else {
        setCollabAuthed(true);
        setUpdates(data.updates);
        setActivity(data.activity);
      }
      setCollabLoading(false);
    });
  }, [noteId]);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") triggerClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll lock
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Re-sync fields when a different card is opened (noteId changes)
  useEffect(() => {
    setTitle(note.content);
    setDescription(note.description ?? "");
    setDueDate(note.due_date ? toDatetimeLocal(note.due_date) : "");
    setEventStart(note.event_start ? toDatetimeLocal(note.event_start) : "");
    setEventEnd(note.event_end ? toDatetimeLocal(note.event_end) : "");
    setArchived(note.archived);
    setStatus((note.status as NoteStatus | null) ?? null);
    setUpdates([]);
    setActivity([]);
    setCollabLoading(true);
    setCollabAuthed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // ------------------------------------------------------------------ helpers

  function triggerClose() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = {};
      if (Object.keys(pending).length > 0) {
        void updateNoteFields(noteId, pending);
      }
    }
    setVisible(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(onClose, 200);
  }

  function scheduleFieldSave(fields: NoteFieldUpdates) {
    pendingRef.current = { ...pendingRef.current, ...fields };
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const toSave = pendingRef.current;
      pendingRef.current = {};
      const { error } = await updateNoteFields(noteId, toSave);
      if (error) {
        onError(`Save failed: ${error}`);
        setSaveStatus("idle");
      } else {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    }, 600);
  }

  // ------------------------------------------------------------------ field handlers

  function handleTitleChange(v: string) {
    setTitle(v);
    onNoteChange(noteId, { content: v });
    scheduleFieldSave({ content: v });
  }

  function handleDescriptionChange(v: string) {
    setDescription(v);
    onNoteChange(noteId, { description: v || null });
    scheduleFieldSave({ description: v || null });
  }

  function handleDueDateChange(v: string) {
    setDueDate(v);
    const iso = v ? new Date(v).toISOString() : null;
    onNoteChange(noteId, { due_date: iso });
    scheduleFieldSave({ due_date: iso });
  }

  function handleEventStartChange(v: string) {
    setEventStart(v);
    const iso = v ? new Date(v).toISOString() : null;
    onNoteChange(noteId, { event_start: iso });
    scheduleFieldSave({ event_start: iso });
  }

  function handleEventEndChange(v: string) {
    setEventEnd(v);
    const iso = v ? new Date(v).toISOString() : null;
    onNoteChange(noteId, { event_end: iso });
    scheduleFieldSave({ event_end: iso });
  }

  const eventRangeError =
    eventEnd && eventStart && new Date(eventEnd) < new Date(eventStart)
      ? "End must be after start"
      : null;

  // ------------------------------------------------------------------ archive

  async function handleArchiveToggle() {
    const newArchived = !archived;
    setArchived(newArchived);
    onNoteChange(noteId, { archived: newArchived });

    const { error } = await updateNoteFields(noteId, { archived: newArchived });
    if (error) {
      setArchived(!newArchived);
      onNoteChange(noteId, { archived: !newArchived });
      onError(`Failed to ${newArchived ? "archive" : "restore"} note`);
      return;
    }

    triggerClose();
  }

  // ------------------------------------------------------------------ status

  async function handleStatusChange(newStatus: NoteStatus | null) {
    const prevStatus = status;
    setStatus(newStatus);
    onNoteChange(noteId, { status: newStatus });
    const { error } = await updateNoteFields(noteId, { status: newStatus });
    if (error) {
      setStatus(prevStatus);
      onNoteChange(noteId, { status: prevStatus });
      onError("Failed to update status");
    }
  }

  // ------------------------------------------------------------------ updates

  async function handlePostUpdate() {
    const trimmed = newUpdate.trim();
    if (!trimmed) return;
    setPostingUpdate(true);

    const { error } = await postNoteUpdate(noteId, {
      content: trimmed,
      statusChange: updateStatusChange,
    });

    setPostingUpdate(false);
    if (error) {
      onError(error === "HTTP 401" ? "Sign in to post updates" : `Failed to post: ${error}`);
      return;
    }

    // Optimistic add
    const optimistic: NoteUpdate = {
      id: `temp-${Date.now()}`,
      note_id: noteId,
      user_id: null,
      content: trimmed,
      status_change: updateStatusChange,
      due_date_change: null,
      created_at: new Date().toISOString(),
    };
    setUpdates((prev) => [...prev, optimistic]);

    // Sync status if changed
    if (updateStatusChange) {
      setStatus(updateStatusChange);
      onNoteChange(noteId, { status: updateStatusChange });
    }

    // Log optimistic activity
    const newActivityRows: NoteActivity[] = [];
    if (updateStatusChange) {
      newActivityRows.push({
        id: `temp-act-s-${Date.now()}`,
        note_id: noteId,
        activity_type: "status_changed",
        payload: { from: status, to: updateStatusChange },
        created_at: new Date().toISOString(),
      });
    }
    newActivityRows.push({
      id: `temp-act-u-${Date.now()}`,
      note_id: noteId,
      activity_type: "update_posted",
      payload: { preview: trimmed.slice(0, 80) },
      created_at: new Date().toISOString(),
    });
    setActivity((prev) => [...prev, ...newActivityRows]);

    setNewUpdate("");
    setUpdateStatusChange(null);
  }

  // ------------------------------------------------------------------ delete everywhere

  async function handleDeleteEverywhere() {
    if (
      !confirm(
        "Delete this card from ALL boards? This cannot be undone — all placements, comments, and labels will be removed.",
      )
    )
      return;

    if (onDeleteEverywhere) {
      await onDeleteEverywhere(noteId);
    } else {
      const { error } = await deleteNote(noteId);
      if (error) {
        onError(`Failed to delete: ${error}`);
        return;
      }
      onNoteDeleted?.(noteId);
    }

    triggerClose();
  }

  // ------------------------------------------------------------------ link to board

  async function handleLinkBoardChange(targetBoardId: string) {
    setLinkBoardId(targetBoardId);
    setLinkColumnId("");
    setLinkColumns([]);
    if (!targetBoardId) return;
    setLinkColumnsLoading(true);
    const { data } = await listColumns(targetBoardId);
    setLinkColumnsLoading(false);
    setLinkColumns(data);
    if (data.length > 0) setLinkColumnId(data[0].id);
  }

  async function handleLink() {
    if (!linkBoardId || !linkColumnId || !onLinkToBoard) return;
    setLinking(true);
    try {
      await onLinkToBoard(noteId, linkBoardId, linkColumnId);
      setLinkSuccess(true);
      setTimeout(() => {
        setLinkSuccess(false);
        setShowLinkForm(false);
        setLinkBoardId("");
        setLinkColumns([]);
        setLinkColumnId("");
      }, 1500);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to link");
    } finally {
      setLinking(false);
    }
  }

  // ------------------------------------------------------------------ categories (private_tags)

  function handleAddTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || currTags.includes(trimmed)) return;
    const updated = [...currTags, trimmed];
    onTagsChange(noteId, updated);
  }

  function handleRemoveTag(tag: string) {
    const updated = currTags.filter((t) => t !== tag);
    onTagsChange(noteId, updated);
  }

  function handlePersonalDueDateChange(date: string | null) {
    onPersonalDueDateChange(noteId, date);
  }

  function handleToggleGroup(groupName: string) {
    const updated = currTags.includes(groupName)
      ? currTags.filter((t) => t !== groupName)
      : [...currTags, groupName];
    onTagsChange(noteId, updated);
  }

  // ------------------------------------------------------------------ labels

  async function handleAttachLabel(labelId: string) {
    const label = boardLabels.find((l) => l.id === labelId);
    if (!label || noteLabels.some((l) => l.id === labelId)) return;
    const updated = [...noteLabels, label];
    setNoteLabels(updated);
    onNoteLabelsChanged(noteId, updated);

    const { error } = await attachLabel(noteId, labelId);
    if (error) {
      const reverted = updated.filter((l) => l.id !== labelId);
      setNoteLabels(reverted);
      onNoteLabelsChanged(noteId, reverted);
      onError("Failed to attach label");
    }
  }

  async function handleDetachLabel(labelId: string) {
    const updated = noteLabels.filter((l) => l.id !== labelId);
    setNoteLabels(updated);
    onNoteLabelsChanged(noteId, updated);

    const { error } = await detachLabel(noteId, labelId);
    if (error) {
      const reverted = [...updated, boardLabels.find((l) => l.id === labelId)!].filter(Boolean);
      setNoteLabels(reverted);
      onNoteLabelsChanged(noteId, reverted);
      onError("Failed to remove label");
    }
  }

  async function handleCreateLabel() {
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    setCreatingLabel(true);
    const { data, error } = await createLabel(boardId, trimmed, newLabelColor);
    setCreatingLabel(false);
    if (error || !data) {
      onError("Failed to create label");
      return;
    }
    onLabelCreated(data);
    setNewLabelName("");
    const updated = [...noteLabels, data];
    setNoteLabels(updated);
    onNoteLabelsChanged(noteId, updated);
    await attachLabel(noteId, data.id);
  }

  // ------------------------------------------------------------------ email threads

  /** Encodes a conversation_id for use in an Outlook readconv deeplink URL. */
  function encodeConversationId(id: string): string {
    return encodeURIComponent(id).replace(/_/g, "%2B");
  }

  /**
   * Builds the Outlook conversation deeplink URL.
   * Base domain is derived from thread.web_link if available (preserves the
   * correct Outlook endpoint for the user's account type), otherwise defaults
   * to outlook.live.com.
   */
  function buildConversationUrl(thread: EmailThreadRow): string {
    let baseOrigin = "https://outlook.live.com";
    if (thread.web_link) {
      try {
        baseOrigin = new URL(thread.web_link).origin;
      } catch {
        // fall through to default
      }
    }
    return `${baseOrigin}/mail/0/deeplink/readconv/${encodeConversationId(thread.conversation_id)}`;
  }

  /**
   * Opens the thread in Outlook.
   *
   * "conversation" mode (default): builds a readconv deeplink from conversation_id
   *   — no auth required, always opens in a new tab immediately.
   *
   * "message" mode: opens the specific message web_link.
   *   - If web_link is stored: opens directly.
   *   - Otherwise: acquires a Mail.Read token (silent → redirect), calls
   *     /api/outlook/message-link, persists + opens the webLink.
   */
  async function handleOpenThread(thread: EmailThreadRow) {
    setEmailOpenError(null);
    const mode = threadOpenMode[thread.id] ?? "conversation";

    if (mode === "conversation") {
      const url = buildConversationUrl(thread);
      console.log("[openThread] conversation mode", { conversationId: thread.conversation_id, url });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    // ---- message mode ----
    console.log("[openThread] message mode start", { threadId: thread.id, hasWebLink: !!thread.web_link });

    if (thread.web_link) {
      console.log("[openThread] message mode: opening stored webLink");
      window.open(thread.web_link, "_blank", "noopener,noreferrer");
      return;
    }

    // Store context so /auth/msal-callback can resume this action after a redirect-based login.
    localStorage.setItem(
      "nb_pending_open_thread",
      JSON.stringify({
        threadId: thread.id,
        noteId,
        returnPath: window.location.pathname + window.location.search,
      }),
    );

    setConnectingThreadId(thread.id);
    try {
      console.log("[openThread] acquiring token…");
      const accessToken = await acquireMailToken();
      console.log("[openThread] token ok", accessToken.slice(0, 12) + "…");

      const fetchUrl = `/api/outlook/message-link?thread_id=${encodeURIComponent(thread.id)}`;
      console.log("[openThread] fetching", fetchUrl);
      const res = await fetch(fetchUrl, { headers: { "X-Ms-Token": accessToken } });
      console.log("[openThread] fetch status", res.status);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[openThread] fetch error", res.status, body);
        const msg = "Could not fetch email link. The message may have been moved or deleted.";
        setEmailOpenError({ threadId: thread.id, msg });
        onError(msg);
        return;
      }

      const json = (await res.json()) as { webLink?: string; error?: string };
      console.log("[openThread] response json", json);

      if (!json.webLink) {
        const msg = "Could not fetch email link from Outlook.";
        setEmailOpenError({ threadId: thread.id, msg });
        onError(msg);
        return;
      }

      setEmailThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, web_link: json.webLink! } : t)),
      );
      console.log("[openThread] message mode: opening", json.webLink);
      window.open(json.webLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[openThread] OPEN THREAD ERROR", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg === "msal_redirect_started") {
        // Page is navigating to Microsoft sign-in. Show a status message and
        // stop — no error to report; /auth/msal-callback will resume the action.
        setEmailSignInRedirecting(thread.id);
        return;
      }
      let msg: string;
      if (errMsg === "msal_not_configured") {
        msg = "Outlook sign-in is not configured. Cannot open email.";
      } else {
        msg = "Couldn't open Outlook email. See console for details.";
      }
      setEmailOpenError({ threadId: thread.id, msg });
      onError(msg);
    } finally {
      setConnectingThreadId(null);
    }
  }

  async function handleUnlinkThread(threadId: string) {
    setEmailThreads((prev) => prev.filter((t) => t.id !== threadId));
    const { error } = await deleteEmailThread(threadId);
    if (error) {
      // Re-fetch on error
      listEmailThreadsForNote(noteId).then(({ data }) => setEmailThreads(data));
      onError("Failed to unlink email thread");
    } else {
      onEmailThreadsChanged?.();
    }
  }

  async function handleLoadAttachments(threadId: string) {
    if (attachmentMap[threadId]) return; // already loaded
    const { data } = await listAttachmentsForThread(threadId);
    setAttachmentMap((prev) => ({ ...prev, [threadId]: data }));
  }

  // ------------------------------------------------------------------ comments

  async function handleAddComment() {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    setAddingComment(true);
    const optimistic: CommentRow = {
      id: `temp-${Date.now()}`,
      note_id: noteId,
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setNewComment("");

    const { data, error } = await addComment(noteId, trimmed);
    setAddingComment(false);
    if (error || !data) {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      setNewComment(trimmed);
      onError("Failed to add comment");
      return;
    }
    setComments((prev) => prev.map((c) => (c.id === optimistic.id ? data : c)));
  }

  async function handleDeleteComment(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { error } = await deleteComment(id);
    if (error) onError("Failed to delete comment");
  }

  // ------------------------------------------------------------------ derived

  const noteLabelIds = new Set(noteLabels.map((l) => l.id));
  const unattachedLabels = boardLabels.filter((l) => !noteLabelIds.has(l.id));

  // Boards available for linking: exclude boards the note is already placed on
  // We show all boards; the DB unique constraint will reject duplicates gracefully
  const otherBoards = boards?.filter((b) => b.id !== boardId) ?? [];

  // ------------------------------------------------------------------ render

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
    >
      <div
        className={`relative w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-5 py-3">
          <input
            className="flex-1 bg-transparent text-base font-semibold text-neutral-100 outline-none placeholder:text-neutral-600"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Note title"
            autoFocus
          />
          <span
            className={`shrink-0 text-xs transition-colors ${
              saveStatus === "saving"
                ? "text-neutral-500"
                : saveStatus === "saved"
                  ? "text-green-500"
                  : "text-transparent select-none"
            }`}
          >
            {saveStatus === "saving" ? "Saving…" : "Saved"}
          </span>
          <button
            className="shrink-0 rounded p-1 text-neutral-400 hover:text-white"
            onClick={triggerClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Status */}
          <section>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">
              Status
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_VALUES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleStatusChange(status === s ? null : s)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    status === s
                      ? `${STATUS_META[s].badgeClass} ring-1 ring-inset ring-white/20`
                      : "border border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dotClass} ${status !== s ? "opacity-40" : ""}`}
                  />
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </section>

          {/* Description */}
          <section>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">
              Description
            </label>
            <textarea
              className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-700"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Add a description…"
              rows={3}
            />
          </section>

          {/* Due Date */}
          <section>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">Due Date</label>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-700"
                value={dueDate}
                onChange={(e) => handleDueDateChange(e.target.value)}
              />
              {dueDate && (
                <button
                  className="text-xs text-neutral-600 hover:text-neutral-400"
                  onClick={() => handleDueDateChange("")}
                >
                  Clear
                </button>
              )}
            </div>
            {dueDate && (
              <p className="mt-1 text-xs text-neutral-500">{formatDisplayDate(dueDate)}</p>
            )}
          </section>

          {/* My Action (Private) */}
          <section>
            <div className="mb-2 flex items-baseline gap-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">My Action</label>
              <span className="text-[11px] text-neutral-700">Visible only to you</span>
            </div>
            <div className="space-y-2">
              {/* Opt-in toggle */}
              <button
                type="button"
                onClick={() => onActionChange(noteId, currAction ? "none" : "needs_action")}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  currAction
                    ? "border-indigo-900/30 bg-indigo-950/60 text-indigo-400"
                    : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    currAction ? "bg-indigo-400" : "bg-neutral-600"
                  }`}
                />
                {currAction ? "In My Actions" : "Add to My Actions"}
              </button>

              {currAction && (
                <>
                  {/* State buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["needs_action", "waiting", "done"] as const).map((s) => {
                      const isActive = currAction === s;
                      const labels = { needs_action: "Needs Action", waiting: "Waiting", done: "Done" };
                      const activeClass = {
                        needs_action: "bg-orange-950/60 text-orange-400 border-orange-900/30",
                        waiting: "bg-sky-950/60 text-sky-400 border-sky-900/30",
                        done: "bg-emerald-950/60 text-emerald-400 border-emerald-900/30",
                      };
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onActionChange(noteId, s)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            isActive
                              ? activeClass[s]
                              : "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
                          }`}
                        >
                          {labels[s]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Mode toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-neutral-600">Mode:</span>
                    {(["timed", "flagged"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onModeChange(noteId, m)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          currMode === m
                            ? "border-indigo-900/30 bg-indigo-950/60 text-indigo-400"
                            : "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
                        }`}
                      >
                        {m === "timed" ? "Timed" : "Flagged"}
                      </button>
                    ))}
                  </div>

                  {/* Timed: personal due date */}
                  {currMode === "timed" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-neutral-600">Personal due:</span>
                      <input
                        type="date"
                        value={currPersonalDue ?? ""}
                        onChange={(e) => handlePersonalDueDateChange(e.target.value || null)}
                        className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300 outline-none focus:border-indigo-500/50"
                      />
                      {currPersonalDue && (
                        <button
                          type="button"
                          onClick={() => handlePersonalDueDateChange(null)}
                          className="text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}

                  {/* Timed: private categories */}
                  {currMode === "timed" && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                        Categories
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {currTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
                          >
                            {tag}
                            <button
                              type="button"
                              className="text-neutral-500 transition-colors hover:text-red-400"
                              onClick={() => handleRemoveTag(tag)}
                              aria-label={`Remove ${tag}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <TagInput onAdd={handleAddTag} />
                      </div>
                    </div>
                  )}

                  {/* Flagged: group picker */}
                  {currMode === "flagged" && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                        Groups
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[...tagDefs]
                          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                          .map((def) => (
                            <button
                              key={def.id}
                              type="button"
                              onClick={() => handleToggleGroup(def.name)}
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                                currTags.includes(def.name)
                                  ? "border-indigo-900/30 bg-indigo-950/60 text-indigo-400"
                                  : "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
                              }`}
                            >
                              {def.name}
                            </button>
                          ))}
                        <NewGroupInline
                          tagDefs={tagDefs}
                          onCreateTagDef={onCreateTagDef}
                          onToggle={handleToggleGroup}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Event Range */}
          <section>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">Event</label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Start</span>
                  <input
                    type="datetime-local"
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-700"
                    value={eventStart}
                    onChange={(e) => handleEventStartChange(e.target.value)}
                  />
                </div>
                {eventStart && (
                  <p className="pl-10 text-xs text-neutral-500">{formatDisplayDate(eventStart)}</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">End</span>
                  <input
                    type="datetime-local"
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-700"
                    value={eventEnd}
                    onChange={(e) => handleEventEndChange(e.target.value)}
                  />
                </div>
                {eventEnd && (
                  <p className="pl-10 text-xs text-neutral-500">{formatDisplayDate(eventEnd)}</p>
                )}
              </div>
              {(eventStart || eventEnd) && (
                <button
                  className="self-start text-xs text-neutral-600 hover:text-neutral-400"
                  onClick={() => {
                    handleEventStartChange("");
                    handleEventEndChange("");
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {eventRangeError && <p className="mt-1 text-xs text-red-400">{eventRangeError}</p>}
          </section>

          {/* Labels */}
          <section>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">Labels</label>
            {labelsLoading ? (
              <p className="text-xs text-neutral-600">Loading…</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {noteLabels.map((label) => (
                    <span
                      key={label.id}
                      className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                      <button
                        className="opacity-70 hover:opacity-100"
                        onClick={() => handleDetachLabel(label.id)}
                        aria-label={`Remove ${label.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    className="rounded-full border border-dashed border-neutral-700 px-2.5 py-0.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-300"
                    onClick={() => setShowPicker((v) => !v)}
                  >
                    + Label
                  </button>
                </div>

                {showPicker && (
                  <div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                    {unattachedLabels.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-neutral-500">Add existing</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unattachedLabels.map((label) => (
                            <button
                              key={label.id}
                              className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white opacity-90 hover:opacity-100"
                              style={{ backgroundColor: label.color }}
                              onClick={() => {
                                handleAttachLabel(label.id);
                                setShowPicker(false);
                              }}
                            >
                              {label.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <p className="text-xs text-neutral-500">Create new</p>
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {LABEL_PALETTE.map(({ hex, label }) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setNewLabelColor(hex)}
                            className={`h-5 w-5 rounded-full transition-all duration-100 ${
                              newLabelColor === hex
                                ? "scale-110 ring-2 ring-white/50 ring-offset-1 ring-offset-neutral-900"
                                : "opacity-60 hover:opacity-100 hover:scale-105"
                            }`}
                            style={{ backgroundColor: hex }}
                            title={label}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-600 placeholder:text-neutral-600"
                          placeholder="Label name"
                          value={newLabelName}
                          onChange={(e) => setNewLabelName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateLabel();
                          }}
                        />
                        <button
                          className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                          onClick={handleCreateLabel}
                          disabled={creatingLabel || !newLabelName.trim()}
                        >
                          {creatingLabel ? "…" : "Create"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Updates */}
          <section>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">
              Updates
            </label>
            {collabLoading ? (
              <p className="text-xs text-neutral-600">Loading…</p>
            ) : collabAuthed === false ? (
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-neutral-600">Sign in to view and post updates.</p>
                <Link href="/login" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  Sign in →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {updates.length === 0 && (
                  <p className="text-xs text-neutral-600">No updates yet.</p>
                )}
                {updates.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
                  >
                    <p className="break-words text-sm text-neutral-200">{u.content}</p>
                    {u.status_change && (
                      <p className="mt-0.5 text-xs text-neutral-500">
                        → Status:{" "}
                        {STATUS_META[u.status_change as NoteStatus]?.label ?? u.status_change}
                      </p>
                    )}
                    {u.due_date_change && (
                      <p className="mt-0.5 text-xs text-neutral-500">
                        → Due:{" "}
                        {u.due_date_change === "cleared" ? "cleared" : u.due_date_change}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-neutral-600">{relativeTime(u.created_at)}</p>
                  </div>
                ))}

                {/* Composer */}
                <div className="space-y-1.5">
                  <textarea
                    className="w-full resize-none rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-700"
                    placeholder="Post an update…"
                    value={newUpdate}
                    onChange={(e) => setNewUpdate(e.target.value)}
                    rows={2}
                    disabled={postingUpdate}
                  />
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-400 outline-none focus:border-neutral-700"
                      value={updateStatusChange ?? ""}
                      onChange={(e) =>
                        setUpdateStatusChange((e.target.value as NoteStatus) || null)
                      }
                    >
                      <option value="">No status change</option>
                      {STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                      onClick={handlePostUpdate}
                      disabled={postingUpdate || !newUpdate.trim()}
                    >
                      {postingUpdate ? "…" : "Post"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Comments */}
          <section>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">Comments</label>
            {commentsLoading ? (
              <p className="text-xs text-neutral-600">Loading…</p>
            ) : (
              <div className="space-y-2">
                {comments.length === 0 && (
                  <p className="text-xs text-neutral-600">No comments yet.</p>
                )}
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="group flex items-start gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-200 break-words">{comment.content}</p>
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {new Date(comment.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      className="shrink-0 text-xs text-neutral-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      onClick={() => handleDeleteComment(comment.id)}
                      aria-label="Delete comment"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-700"
                    placeholder="Add a comment…"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) handleAddComment();
                    }}
                    disabled={addingComment}
                  />
                  <button
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                    onClick={handleAddComment}
                    disabled={addingComment || !newComment.trim()}
                  >
                    {addingComment ? "…" : "Add"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Activity */}
          {collabAuthed !== false && (collabLoading || activity.length > 0) && (
            <section>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                Activity
              </label>
              {collabLoading ? (
                <p className="text-xs text-neutral-600">Loading…</p>
              ) : (
                <div className="space-y-1.5">
                  {activity.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 text-xs text-neutral-600">
                      <span className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neutral-700" />
                      <span className="flex-1">{formatActivity(a)}</span>
                      <span className="shrink-0">{relativeTime(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Email threads */}
          {(emailThreadsLoading || emailThreads.length > 0) && (
            <section>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                Email threads
              </label>
              {emailThreadsLoading ? (
                <p className="text-xs text-neutral-600">Loading…</p>
              ) : (
                <div className="space-y-2">
                  {emailThreads.map((thread) => {
                    const threadAttachments = attachmentMap[thread.id];
                    return (
                      <div
                        key={thread.id}
                        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-neutral-200">
                              ✉️ {thread.subject ?? "Email thread"}
                            </p>
                            {thread.last_activity_at && (
                              <p className="mt-0.5 text-xs text-neutral-500">
                                {relativeTime(thread.last_activity_at)}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {/* Conversation / Message toggle */}
                            <div className="flex items-center rounded border border-white/[0.08] overflow-hidden">
                              {(["conversation", "message"] as const).map((m) => {
                                const active = (threadOpenMode[thread.id] ?? "conversation") === m;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() =>
                                      setThreadOpenMode((prev) => ({ ...prev, [thread.id]: m }))
                                    }
                                    className={`px-1.5 py-0.5 text-[10px] capitalize transition-colors cursor-pointer ${
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
                              disabled={connectingThreadId !== null || emailSignInRedirecting !== null}
                              onClick={() => {
                                void handleOpenThread(thread);
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                            >
                              {emailSignInRedirecting === thread.id
                                ? "Signing in…"
                                : connectingThreadId === thread.id
                                ? "Connecting…"
                                : "Open →"}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-neutral-600 hover:text-red-400 transition-colors"
                              onClick={() => handleUnlinkThread(thread.id)}
                            >
                              Unlink
                            </button>
                          </div>
                        </div>

                        {/* Redirect sign-in in progress */}
                        {emailSignInRedirecting === thread.id && (
                          <p className="mt-1.5 text-xs text-blue-400">
                            Completing Microsoft sign-in — you&apos;ll be returned here automatically.
                          </p>
                        )}

                        {/* Inline error for this thread */}
                        {emailOpenError?.threadId === thread.id && (
                          <p className="mt-1.5 text-xs text-red-400">
                            {emailOpenError.msg}
                          </p>
                        )}

                        {/* Attachment section */}
                        {threadAttachments === undefined ? (
                          <button
                            className="mt-1.5 text-xs text-neutral-500 hover:text-neutral-400 underline underline-offset-2"
                            onClick={() => handleLoadAttachments(thread.id)}
                          >
                            Show attachments
                          </button>
                        ) : threadAttachments.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-neutral-500">
                              Attachments ({threadAttachments.length})
                            </p>
                            {threadAttachments.map((att) => (
                              <div
                                key={att.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="truncate text-xs text-neutral-300">
                                  {att.file_name}
                                </span>
                                <button
                                  className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                                  onClick={() => {
                                    // Phase 1 will wire real Outlook deep-link
                                    console.log("Open email with attachment", att.message_id);
                                  }}
                                >
                                  Open email
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Link to board */}
          {onLinkToBoard && otherBoards.length > 0 && (
            <section className="border-t border-neutral-800 pt-4">
              {!showLinkForm ? (
                <button
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors"
                  onClick={() => setShowLinkForm(true)}
                >
                  🔗 Link to another board…
                </button>
              ) : (
                <div className="space-y-2.5 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-400">Link to board</p>
                  <select
                    className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                    value={linkBoardId}
                    onChange={(e) => handleLinkBoardChange(e.target.value)}
                  >
                    <option value="">Select board…</option>
                    {otherBoards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  {linkBoardId && (
                    <>
                      {linkColumnsLoading ? (
                        <p className="text-xs text-neutral-600">Loading columns…</p>
                      ) : linkColumns.length === 0 ? (
                        <p className="text-xs text-neutral-500">No columns on this board.</p>
                      ) : (
                        <select
                          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                          value={linkColumnId}
                          onChange={(e) => setLinkColumnId(e.target.value)}
                        >
                          {linkColumns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}

                  {linkSuccess ? (
                    <p className="text-xs text-green-500">Linked successfully!</p>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                        onClick={handleLink}
                        disabled={linking || !linkBoardId || !linkColumnId}
                      >
                        {linking ? "Linking…" : "Link"}
                      </button>
                      <button
                        className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                        onClick={() => {
                          setShowLinkForm(false);
                          setLinkBoardId("");
                          setLinkColumns([]);
                          setLinkColumnId("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Archive + Delete everywhere */}
          <section className="border-t border-neutral-800 pt-4 flex flex-wrap items-center gap-3">
            <button
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                archived
                  ? "border-green-700 text-green-400 hover:bg-green-900/20"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
              onClick={handleArchiveToggle}
            >
              {archived ? "Restore from Archive" : "Archive Card"}
            </button>

            <button
              className="rounded-md border border-red-900 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-900/20 hover:text-red-400"
              onClick={handleDeleteEverywhere}
            >
              Delete everywhere
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Inline new-group creator (Flagged mode group picker) ──────────────────────

function NewGroupInline({
  tagDefs,
  onCreateTagDef,
  onToggle,
}: {
  tagDefs: TagDef[];
  onCreateTagDef: (name: string) => Promise<TagDef | null>;
  onToggle: (name: string) => void;
}) {
  const [value, setValue] = useState("");

  async function submit() {
    const name = value.trim();
    if (!name) return;
    setValue("");
    const existing = tagDefs.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      onToggle(existing.name);
      return;
    }
    const created = await onCreateTagDef(name);
    if (created) onToggle(created.name);
  }

  return (
    <input
      className="w-24 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-neutral-600"
      placeholder="+ new group"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void submit();
        }
      }}
      onBlur={() => {
        if (value.trim()) void submit();
      }}
    />
  );
}

// ── Tag input — inline quick-add for private categories ───────────────────────

function TagInput({ onAdd }: { onAdd: (tag: string) => void }) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  }

  return (
    <input
      className="w-24 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-neutral-600"
      placeholder="+ category"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
      onBlur={submit}
    />
  );
}

function formatActivity(a: NoteActivity): string {
  const p = a.payload as Record<string, string>;
  switch (a.activity_type) {
    case "status_changed":
      return `Status → ${STATUS_META[p.to as NoteStatus]?.label ?? p.to}`;
    case "due_date_changed":
      return `Due date → ${p.value === "cleared" || !p.value ? "cleared" : p.value}`;
    case "update_posted":
      return `Update posted`;
    default:
      return a.activity_type;
  }
}

// "2h ago", "45m ago", "3d ago"
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Convert UTC ISO string → datetime-local value (local time)
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Format a datetime-local string or ISO string → "Feb 18, 2026 3:30 AM"
function formatDisplayDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const month = d.toLocaleString(undefined, { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  const time = d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${month} ${day}, ${year} ${time}`;
}
