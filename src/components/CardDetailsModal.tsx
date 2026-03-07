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
import {
  NoteLinkRow,
  listNoteLinks,
  addNoteLink,
  deleteNoteLink,
} from "@/lib/noteLinks";
import {
  NoteAttachmentRow,
  listNoteAttachments,
  uploadNoteAttachment,
  deleteNoteAttachment,
} from "@/lib/noteAttachments";
import { acquireMailToken } from "@/lib/msalConfig";
import { LABEL_PALETTE } from "@/lib/palette";
import { DateRangePicker } from "@/components/DateRangePicker";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";
import type { DateRange } from "@/components/DateRangePicker";
import {
  NoteActivity,
  NoteStatus,
  STATUS_META,
  STATUS_VALUES,
  listCollab,
} from "@/lib/collab";
import { updateNoteDueDate } from "@/lib/userActions";

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
  last_public_activity_at: string | null;
  last_public_activity_user_id: string | null;
  last_public_activity_type: string | null;
  last_public_activity_preview: string | null;
  updated_at?: string | null;
  visibility?: string | null;
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
    onDueDateChange,
    onToggleInActions,
    onCreateTagDef,
  } = useActions();
  const currAction = (actionMap[noteId]?.action_state ?? null) as ActionState | null;
  const currMode: ActionMode = actionMap[noteId]?.action_mode ?? "timed";
  const currTags = actionMap[noteId]?.private_tags ?? [];
  const isInActions = actionMap[noteId]?.is_in_actions ?? false;

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

  // --- Collab (activity + comments) ---
  const [activity, setActivity] = useState<NoteActivity[]>([]);
  const [collabLoading, setCollabLoading] = useState(true);
  const [collabAuthed, setCollabAuthed] = useState<boolean | null>(null); // null=loading, false=unauthed
  const [collabUserId, setCollabUserId] = useState<string | null>(null);
  const [composerStatusChange, setComposerStatusChange] = useState<NoteStatus | null>(null);

  // --- Kebab menu ---
  const [showKebabMenu, setShowKebabMenu] = useState(false);

  // --- Local (optimistic) activity events that aren't persisted server-side yet ---
  // We push entries here on field changes so the activity feed updates immediately.
  type LocalEvent = { id: string; text: string; ts: string };
  const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);

  function pushLocalEvent(text: string) {
    setLocalEvents((prev) => [
      { id: `local-${Date.now()}-${Math.random()}`, text, ts: new Date().toISOString() },
      ...prev,
    ]);
  }

  // --- Debounced save ---
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<NoteFieldUpdates>({});

  // --- Visibility ---
  const [visibility, setVisibility] = useState<"personal" | "shared">(
    (note.visibility as "personal" | "shared") ?? "personal",
  );
  const [showVisibilityConfirm, setShowVisibilityConfirm] = useState(false);

  // --- My Layer panel (OLD layout) ---
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("nb_panel_open") !== "false";
  });

  // --- My layer collapse (NEW layout) ---
  const [myLayerOpen, setMyLayerOpen] = useState<boolean>(() => {
    const hasLocalData =
      typeof window !== "undefined" &&
      (localStorage.getItem(`nb_reminder_${noteId}`) ?? "").trim().length > 0;
    return isInActions || hasLocalData;
  });

  // --- Personal reminder (localStorage only) ---
  const [personalReminder, setPersonalReminder] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`nb_reminder_${noteId}`) ?? "";
  });

  // --- Context section expanders ---
  const [showAttachments, setShowAttachments] = useState(false);
  const [showLinks, setShowLinks] = useState(false);

  // --- Note attachments ---
  const [noteAttachments, setNoteAttachments] = useState<NoteAttachmentRow[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<NoteAttachmentRow | null>(null);

  // --- Note links ---
  const [noteLinks, setNoteLinks] = useState<NoteLinkRow[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [addingLinkRow, setAddingLinkRow] = useState(false);

  // --- Event range picker ---
  const [showEventPicker, setShowEventPicker] = useState(false);

  // --- Animation ---
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);
  const emailsRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLDivElement>(null);

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
    });
    listEmailThreadsForNote(noteId).then(({ data }) => {
      setEmailThreads(data);
      setEmailThreadsLoading(false);
      if (data.length > 0) setMyLayerOpen(true);
      // Eagerly load attachments for all linked threads
      data.forEach((t) => {
        listAttachmentsForThread(t.id).then(({ data: atts }) => {
          setAttachmentMap((prev) => ({ ...prev, [t.id]: atts }));
        });
      });
    });
    listCollab(noteId).then((data) => {
      if (data === null) {
        setCollabAuthed(false);
      } else {
        setCollabAuthed(true);
        setActivity(data.activity);
        setLocalEvents([]);
        setCollabUserId(data.currentUserId ?? null);
      }
      setCollabLoading(false);
    });
    listNoteAttachments(noteId).then(({ data }) => setNoteAttachments(data));
    listNoteLinks(noteId).then(({ data }) => setNoteLinks(data));
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

  // Close kebab on outside click
  useEffect(() => {
    if (!showKebabMenu) return;
    function onDown(e: MouseEvent) {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setShowKebabMenu(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showKebabMenu]);

  // Close kebab on Escape — capture phase so it runs before the modal's bubble-phase handler
  useEffect(() => {
    if (!showKebabMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setShowKebabMenu(false);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [showKebabMenu]);

  // Re-sync fields when a different card is opened (noteId changes)
  useEffect(() => {
    setTitle(note.content);
    setDescription(note.description ?? "");
    setDueDate(note.due_date ? toDatetimeLocal(note.due_date) : "");
    setEventStart(note.event_start ? toDatetimeLocal(note.event_start) : "");
    setEventEnd(note.event_end ? toDatetimeLocal(note.event_end) : "");
    setArchived(note.archived);
    setStatus((note.status as NoteStatus | null) ?? null);
    setVisibility((note.visibility as "personal" | "shared") ?? "personal");
    setShowEventPicker(false);
    setPersonalReminder(
      typeof window !== "undefined" ? (localStorage.getItem(`nb_reminder_${noteId}`) ?? "") : "",
    );
    setMyLayerOpen(
      Boolean(actionMap[noteId]?.is_in_actions) ||
        (typeof window !== "undefined" &&
          (localStorage.getItem(`nb_reminder_${noteId}`) ?? "").trim().length > 0),
    );
    setActivity([]);
    setLocalEvents([]);
    setCollabLoading(true);
    setCollabAuthed(null);
    setCollabUserId(null);
    setShowAttachments(false);
    setShowLinks(false);
    setNoteAttachments([]);
    setPreviewAttachment(null);
    setNoteLinks([]);
    setNewLinkUrl("");
    setNewLinkTitle("");
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
    const dateStr = v ? v.slice(0, 10) : null;
    const iso = v ? new Date(v).toISOString() : null;
    onNoteChange(noteId, { due_date: iso });
    void updateNoteDueDate(noteId, dateStr);
    onDueDateChange(noteId, dateStr);
    pushLocalEvent(v ? `Due date set to ${new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "Due date cleared");
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

  function handleEventRangeClear() {
    handleEventStartChange("");
    handleEventEndChange("");
    setShowEventPicker(false);
    pushLocalEvent("Event range cleared");
  }

  function handleEventRangeSet(start: string, end: string) {
    // Called after a DateRangePicker selection
    const fmt = (dt: string) => new Date(dt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (start && end) pushLocalEvent(`Event set ${fmt(start)} – ${fmt(end)}`);
    else if (start) pushLocalEvent(`Event start set to ${fmt(start)}`);
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
    pushLocalEvent(
      newStatus
        ? `Status changed to ${STATUS_META[newStatus]?.label ?? newStatus}`
        : "Status cleared",
    );
    const { error } = await updateNoteFields(noteId, { status: newStatus });
    if (error) {
      setStatus(prevStatus);
      onNoteChange(noteId, { status: prevStatus });
      onError("Failed to update status");
    }
  }

  // ------------------------------------------------------------------ visibility

  async function handleVisibilityChange(next: "personal" | "shared") {
    setVisibility(next);
    onNoteChange(noteId, { visibility: next });
    scheduleFieldSave({ visibility: next });
    pushLocalEvent(next === "shared" ? "Card made shared" : "Card made personal");
  }

  // ------------------------------------------------------------------ panel

  function togglePanel() {
    setPanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem("nb_panel_open", String(next));
      return next;
    });
  }

  function handleEmailChipClick() {
    if (!myLayerOpen) setMyLayerOpen(true);
    setTimeout(() => emailsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  }

  // ------------------------------------------------------------------ personal reminder

  function handlePersonalReminderChange(v: string) {
    setPersonalReminder(v);
    localStorage.setItem(`nb_reminder_${noteId}`, v);
  }

  // ------------------------------------------------------------------ attachments

  async function handleUploadFile(file: File) {
    setUploadingFile(true);
    const { data, error } = await uploadNoteAttachment(noteId, file);
    setUploadingFile(false);
    if (error) { onError(`Upload failed: ${error}`); return; }
    if (data) {
      setNoteAttachments((prev) => [...prev, data]);
      pushLocalEvent(`Attached "${file.name}"`);
    }
  }

  async function handleDeleteAttachment(att: NoteAttachmentRow) {
    setNoteAttachments((prev) => prev.filter((a) => a.id !== att.id));
    const { error } = await deleteNoteAttachment(att.id, att.storage_path);
    if (error) {
      setNoteAttachments((prev) => [...prev, att]);
      onError("Failed to delete attachment");
    } else {
      pushLocalEvent(`Removed attachment "${att.file_name}"`);
    }
  }

  // ------------------------------------------------------------------ links

  async function handleAddLink() {
    const raw = newLinkUrl.trim();
    if (!raw) return;

    // Normalize: prepend https:// if no protocol is present
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    // Validate: must parse as a URL with a real hostname
    try {
      const parsed = new URL(url);
      if (!parsed.hostname || !parsed.hostname.includes(".")) throw new Error();
    } catch {
      onError("Please enter a valid URL (e.g. https://example.com)");
      return;
    }

    setAddingLinkRow(true);
    const { data, error } = await addNoteLink(noteId, url, newLinkTitle.trim() || null);
    setAddingLinkRow(false);
    if (error) { onError(`Failed to add link: ${error}`); return; }
    if (data) {
      setNoteLinks((prev) => [...prev, data]);
      setNewLinkUrl("");
      setNewLinkTitle("");
      pushLocalEvent(`Added link${data.title ? ` "${data.title}"` : ` ${linkHostname(url)}`}`);
    }
  }

  async function handleDeleteLink(id: string) {
    const removed = noteLinks.find((l) => l.id === id);
    setNoteLinks((prev) => prev.filter((l) => l.id !== id));
    const { error } = await deleteNoteLink(id);
    if (error) {
      if (removed) setNoteLinks((prev) => [...prev, removed]);
      onError("Failed to delete link");
    } else if (removed) {
      pushLocalEvent(`Removed link "${removed.title || linkHostname(removed.url)}"`);
    }
  }

  // ------------------------------------------------------------------ composer submit

  async function handleSubmitComposer() {
    const hasComment = newComment.trim().length > 0;
    const hasStatus = composerStatusChange !== null;
    if (!hasComment && !hasStatus) return;

    // Status change — handleStatusChange already pushes a local event
    if (hasStatus) {
      void handleStatusChange(composerStatusChange!);
      setComposerStatusChange(null);
    }

    // Comment text — post as normal comment
    if (hasComment) {
      await handleAddComment();
    }
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

  /**
   * Builds the Outlook conversation URL.
   * Base origin is derived from thread.web_link if available, else outlook.live.com.
   *
   * Outlook Live personal: /mail/0/id/<conversationId>[?q="<subject>"]
   * Outlook Live fallback:  /mail/0/?q="<subject>"  (no conversation_id)
   * Enterprise (M365/OWA):  /mail/0/deeplink/readconv/<encodedId>
   *
   * Returns null if there is not enough data to build any useful URL.
   */
  function buildConversationUrl(thread: EmailThreadRow): string | null {
    let origin = "https://outlook.live.com";
    if (thread.web_link) {
      try {
        origin = new URL(thread.web_link).origin;
      } catch {
        // fall through to default
      }
    }
    const host = new URL(origin).hostname;
    if (host.includes("outlook.live.com")) {
      const q = thread.subject
        ? `?q=${encodeURIComponent(`"${thread.subject}"`)}`
        : "";
      if (thread.conversation_id) {
        const encodedId = encodeURIComponent(thread.conversation_id);
        return `${origin}/mail/0/id/${encodedId}${q}`;
      }
      if (thread.subject) {
        return `${origin}/mail/0/${q}`;
      }
      return null;
    }
    // Enterprise OWA / M365 deeplink
    if (!thread.conversation_id) return null;
    const encodedId = encodeURIComponent(thread.conversation_id).replace(/_/g, "%2B");
    return `${origin}/mail/0/deeplink/readconv/${encodedId}`;
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
      if (!url) {
        const msg = "Not enough data to build a conversation URL for this thread.";
        setEmailOpenError({ threadId: thread.id, msg });
        onError(msg);
        return;
      }
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
    const thread = emailThreads.find((t) => t.id === threadId);
    setEmailThreads((prev) => prev.filter((t) => t.id !== threadId));
    const { error } = await deleteEmailThread(threadId);
    if (error) {
      listEmailThreadsForNote(noteId).then(({ data }) => setEmailThreads(data));
      onError("Failed to unlink email thread");
    } else {
      pushLocalEvent(`Email unlinked${thread?.subject ? `: "${thread.subject}"` : ""}`);
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

  type FeedEntry =
    | { kind: "comment"; data: CommentRow; ts: string }
    | { kind: "activity"; data: NoteActivity; ts: string }
    | { kind: "local"; id: string; text: string; ts: string };

  // Newest first
  const feedEntries: FeedEntry[] = [
    ...comments.map((c) => ({ kind: "comment" as const, data: c, ts: c.created_at })),
    ...activity.map((a) => ({ kind: "activity" as const, data: a, ts: a.created_at })),
    ...localEvents.map((e) => ({ kind: "local" as const, id: e.id, text: e.text, ts: e.ts })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // Boards available for linking: exclude boards the note is already placed on
  // We show all boards; the DB unique constraint will reject duplicates gracefully
  const otherBoards = boards?.filter((b) => b.id !== boardId) ?? [];

  // Feature flag — set to false to revert to the previous layout instantly
  const NEW_CARD_LAYOUT = true;

  // ------------------------------------------------------------------ render

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-200 sm:flex sm:items-start sm:justify-center sm:overflow-y-auto sm:p-4 sm:py-10 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
    >
      {/* Panel */}
      <div
        className={`fixed inset-0 flex flex-col bg-neutral-950 transition-all duration-200 sm:relative sm:inset-auto sm:w-full ${NEW_CARD_LAYOUT ? "sm:max-w-4xl" : "sm:max-w-3xl"} sm:rounded-xl sm:border sm:border-neutral-800 sm:shadow-2xl ${
          visible ? "opacity-100 sm:scale-100" : "opacity-0 sm:scale-95"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Confirmation overlay — Personal → Shared */}
        {showVisibilityConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/60">
            <div className="mx-4 max-w-sm space-y-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
              <p className="text-sm font-medium text-neutral-100">
                This card will become visible to others.
              </p>
              <p className="text-xs text-neutral-500">Your private layer will remain private.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleVisibilityChange("shared");
                    setShowVisibilityConfirm(false);
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Make Shared
                </button>
                <button
                  type="button"
                  onClick={() => setShowVisibilityConfirm(false)}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── HEADER ─────────────────────────────────── */}
        <div className="relative flex-shrink-0 border-b border-neutral-800 bg-neutral-950 pb-0 pl-5 pr-4 pt-3 sm:sticky sm:top-0 sm:z-10">
          {/* Row 1: title + controls */}
          <div className="flex items-center gap-3 pb-2">
            <input
              className="flex-1 bg-transparent text-base font-semibold text-neutral-100 outline-none placeholder:text-neutral-600"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Untitled"
              autoFocus
            />
            {/* Visibility toggle */}
            <div className="flex overflow-hidden rounded-lg border border-neutral-800 text-xs">
              {(["personal", "shared"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() =>
                    v === "shared" && visibility === "personal"
                      ? setShowVisibilityConfirm(true)
                      : void handleVisibilityChange(v)
                  }
                  className={`px-3 py-1 transition-colors ${
                    visibility === v
                      ? "bg-neutral-800 font-medium text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {v === "personal" ? "Personal" : "Shared"}
                </button>
              ))}
            </div>
            <span
              className={`shrink-0 text-xs transition-colors ${
                saveStatus === "saving"
                  ? "text-neutral-500"
                  : saveStatus === "saved"
                    ? "text-green-500"
                    : "select-none text-transparent"
              }`}
            >
              {saveStatus === "saving" ? "Saving…" : "Saved"}
            </span>
            {/* Kebab menu */}
            <div className="relative" ref={kebabRef}>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-neutral-500 hover:text-neutral-200"
                onClick={() => setShowKebabMenu((v) => !v)}
                aria-label="More actions"
              >
                ···
              </button>
              {showKebabMenu && (
                <div className="absolute right-0 top-full z-40 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
                  {onLinkToBoard && otherBoards.length > 0 && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                      onClick={() => { setShowLinkForm(true); setShowKebabMenu(false); }}
                    >
                      🔗 Link to another board…
                    </button>
                  )}
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-neutral-800 ${archived ? "text-green-400" : "text-neutral-300"}`}
                    onClick={() => { void handleArchiveToggle(); setShowKebabMenu(false); }}
                  >
                    {archived ? "Restore from archive" : "Archive"}
                  </button>
                  <div className="my-1 border-t border-neutral-800" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-neutral-800"
                    onClick={() => { void handleDeleteEverywhere(); setShowKebabMenu(false); }}
                  >
                    Delete everywhere
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 rounded p-1 text-neutral-400 hover:text-white"
              onClick={triggerClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {NEW_CARD_LAYOUT ? (
            /* ── NEW: single meta row — Labels · Status · Due · Event ── */
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-neutral-800/50 pb-2.5 pt-2 text-[11px]">
                {/* Labels inline */}
                {labelsLoading ? (
                  <span className="text-neutral-700">…</span>
                ) : (
                  <>
                    {noteLabels.map((label) => (
                      <span
                        key={label.id}
                        className="flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium text-white"
                        style={{ backgroundColor: label.color }}
                      >
                        {label.name}
                        <button
                          type="button"
                          className="ml-0.5 opacity-60 hover:opacity-100"
                          onClick={() => handleDetachLabel(label.id)}
                          aria-label={`Remove ${label.name}`}
                        >×</button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="rounded-full border border-dashed border-neutral-800 px-2 py-0.5 text-neutral-700 transition-colors hover:border-neutral-600 hover:text-neutral-500"
                      onClick={() => setShowPicker((v) => !v)}
                    >+ Label</button>
                  </>
                )}

                {/* Divider */}
                <span className="h-3.5 w-px shrink-0 bg-neutral-800" />

                {/* Status */}
                <div className="flex items-center gap-1 text-neutral-600">
                  {status && <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dotClass}`} />}
                  <select
                    className="cursor-pointer bg-transparent text-neutral-500 outline-none"
                    value={status ?? ""}
                    onChange={(e) => void handleStatusChange((e.target.value as NoteStatus) || null)}
                  >
                    <option value="">Status</option>
                    {STATUS_VALUES.filter((s) => s !== "done").map((s) => (
                      <option key={s} value={s}>{STATUS_META[s].label}</option>
                    ))}
                  </select>
                </div>

                {/* Dates — Due + Event grouped */}
                {(() => {
                  const hasDue = Boolean(dueDate);
                  const hasEvent = Boolean(eventStart || eventEnd);
                  const fmtDate = (dt: string) => new Date(dt).toLocaleString(undefined, { month: "short", day: "numeric" });
                  function handleRangeChange({ from, to }: DateRange) {
                    let newStart = "";
                    let newEnd = "";
                    if (from) {
                      const ex = eventStart ? new Date(eventStart) : null;
                      from.setHours(ex?.getHours() ?? 9, ex?.getMinutes() ?? 0, 0, 0);
                      newStart = toDatetimeLocal(from.toISOString());
                      handleEventStartChange(newStart);
                    } else { handleEventStartChange(""); }
                    if (to) {
                      const ex = eventEnd ? new Date(eventEnd) : null;
                      to.setHours(ex?.getHours() ?? 17, ex?.getMinutes() ?? 0, 0, 0);
                      newEnd = toDatetimeLocal(to.toISOString());
                      handleEventEndChange(newEnd);
                    } else { handleEventEndChange(""); }
                    if (newStart || newEnd) handleEventRangeSet(newStart, newEnd);
                  }
                  return (
                    <div className="relative flex items-center gap-1.5 text-neutral-600">
                      <span>Dates</span>
                      <input ref={dueDateInputRef} type="datetime-local" className="sr-only" value={dueDate} onChange={(e) => handleDueDateChange(e.target.value)} tabIndex={-1} />
                      {/* Due sub-chip */}
                      <button type="button" onClick={() => dueDateInputRef.current?.showPicker()}
                        className={`rounded-full px-2 py-0.5 transition-colors ${hasDue ? "border border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600" : "border border-dashed border-neutral-800 text-neutral-700 hover:border-neutral-700 hover:text-neutral-500"}`}>
                        {hasDue ? fmtDate(dueDate) : "Due"}
                      </button>
                      {hasDue && <button type="button" className="text-neutral-700 hover:text-neutral-400" onClick={() => handleDueDateChange("")}>×</button>}
                      {/* Event sub-chip */}
                      <button type="button" onClick={() => setShowEventPicker((v) => !v)}
                        className={`rounded-full px-2 py-0.5 transition-colors ${hasEvent ? "border border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600" : "border border-dashed border-neutral-800 text-neutral-700 hover:border-neutral-700 hover:text-neutral-500"}`}>
                        {hasEvent ? `${eventStart ? fmtDate(eventStart) : "?"} – ${eventEnd ? fmtDate(eventEnd) : "?"}` : "Event"}
                      </button>
                      {hasEvent && (
                        <button type="button" className="text-neutral-700 hover:text-neutral-400"
                          onClick={handleEventRangeClear}>×</button>
                      )}
                      {showEventPicker && (
                        <div className="absolute left-0 top-full z-30 mt-1">
                          <DateRangePicker
                            value={{ from: eventStart ? new Date(eventStart) : null, to: eventEnd ? new Date(eventEnd) : null }}
                            onChange={handleRangeChange}
                            onClose={() => setShowEventPicker(false)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Event range validation error */}
              {eventRangeError && (
                <p className="pb-1.5 text-[11px] text-red-400">{eventRangeError}</p>
              )}

              {/* Label picker — drops below header (shared by both layouts) */}
              {showPicker && (
                <div className="absolute left-0 right-0 top-full z-30 border-t border-neutral-800 bg-neutral-950 px-5 py-3 shadow-xl">
                  <div className="space-y-3">
                    {unattachedLabels.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-neutral-500">Add existing</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unattachedLabels.map((label) => (
                            <button
                              key={label.id}
                              type="button"
                              className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white opacity-90 hover:opacity-100"
                              style={{ backgroundColor: label.color }}
                              onClick={() => { handleAttachLabel(label.id); setShowPicker(false); }}
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
                                ? "scale-110 ring-2 ring-white/50 ring-offset-1 ring-offset-neutral-950"
                                : "opacity-60 hover:scale-105 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: hex }}
                            title={label}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
                          placeholder="Label name"
                          value={newLabelName}
                          onChange={(e) => setNewLabelName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCreateLabel(); }}
                        />
                        <button
                          type="button"
                          className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                          onClick={handleCreateLabel}
                          disabled={creatingLabel || !newLabelName.trim()}
                        >
                          {creatingLabel ? "…" : "Create"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ── OLD: separate label row + timeline row ── */
            <>
              {/* Row 2: labels */}
              <div className="flex flex-wrap items-center gap-1.5 pb-2">
                {labelsLoading ? (
                  <span className="text-[11px] text-neutral-700">…</span>
                ) : (
                  <>
                    {noteLabels.map((label) => (
                      <span
                        key={label.id}
                        className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                        style={{ backgroundColor: label.color }}
                      >
                        {label.name}
                        <button
                          type="button"
                          className="ml-0.5 opacity-60 hover:opacity-100"
                          onClick={() => handleDetachLabel(label.id)}
                          aria-label={`Remove ${label.name}`}
                        >×</button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="rounded-full border border-dashed border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-700 transition-colors hover:border-neutral-600 hover:text-neutral-500"
                      onClick={() => setShowPicker((v) => !v)}
                    >+ Label</button>
                  </>
                )}
              </div>

              {/* Label picker — drops below header */}
              {showPicker && (
                <div className="absolute left-0 right-0 top-full z-30 border-t border-neutral-800 bg-neutral-950 px-5 py-3 shadow-xl">
                  <div className="space-y-3">
                    {unattachedLabels.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-neutral-500">Add existing</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unattachedLabels.map((label) => (
                            <button
                              key={label.id}
                              type="button"
                              className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white opacity-90 hover:opacity-100"
                              style={{ backgroundColor: label.color }}
                              onClick={() => { handleAttachLabel(label.id); setShowPicker(false); }}
                            >{label.name}</button>
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
                                ? "scale-110 ring-2 ring-white/50 ring-offset-1 ring-offset-neutral-950"
                                : "opacity-60 hover:scale-105 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: hex }}
                            title={label}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
                          placeholder="Label name"
                          value={newLabelName}
                          onChange={(e) => setNewLabelName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCreateLabel(); }}
                        />
                        <button
                          type="button"
                          className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                          onClick={handleCreateLabel}
                          disabled={creatingLabel || !newLabelName.trim()}
                        >{creatingLabel ? "…" : "Create"}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Row 3: timeline — Due · Event · Status */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-800/50 py-2 text-[11px] text-neutral-600">
                <div className="flex items-center gap-1.5">
                  <span>Due</span>
                  <input ref={dueDateInputRef} type="datetime-local" className="sr-only" value={dueDate} onChange={(e) => handleDueDateChange(e.target.value)} tabIndex={-1} />
                  <button type="button" onClick={() => dueDateInputRef.current?.showPicker()}
                    className={`rounded-full px-2 py-0.5 transition-colors ${dueDate ? "border border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600" : "border border-dashed border-neutral-800 text-neutral-700 hover:border-neutral-700 hover:text-neutral-500"}`}>
                    {dueDate ? new Date(dueDate).toLocaleString(undefined, { month: "short", day: "numeric" }) : "Set"}
                  </button>
                  {dueDate && <button type="button" className="text-neutral-700 hover:text-neutral-400" onClick={() => handleDueDateChange("")}>×</button>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Status</span>
                  {status && <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dotClass}`} />}
                  <select className="cursor-pointer bg-transparent text-[11px] text-neutral-500 outline-none" value={status ?? ""} onChange={(e) => void handleStatusChange((e.target.value as NoteStatus) || null)}>
                    <option value="">—</option>
                    {STATUS_VALUES.filter((s) => s !== "done").map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        {NEW_CARD_LAYOUT ? (
          /* ── NEW: left = info + personal layer; right = activity ── */
          <div className="flex flex-1 overflow-hidden">

            {/* ── LEFT COLUMN ── */}
            <div className="min-w-0 flex-1 overflow-y-auto">
              <div className="space-y-6 px-6 py-5">

                {/* About / description — content-first, no border box */}
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-neutral-600">About</p>
                  <AutoTextarea
                    className="w-full bg-transparent text-sm leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-600"
                    placeholder="Add a description…"
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                  />
                </div>

                {/* My layer — personal, collapsible */}
                <div className="rounded-xl bg-neutral-900/40 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setMyLayerOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-[11px] font-medium text-neutral-600 hover:text-neutral-400"
                  >
                    <span>My layer</span>
                    <div className="flex items-center gap-2">
                      {!myLayerOpen && (
                        <span className="text-[10px] font-normal normal-case tracking-normal text-neutral-700">
                          {[
                            isInActions && "In Actions",
                            personalReminder.trim() && "note",
                            emailThreads.length > 0 && `${emailThreads.length} email${emailThreads.length !== 1 ? "s" : ""}`,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span className="text-neutral-700">{myLayerOpen ? "▾" : "▸"}</span>
                    </div>
                  </button>

                  {myLayerOpen && (
                    <div className="space-y-4 border-t border-neutral-800/40 px-4 pb-4 pt-3">

                      {/* My actions */}
                      <div>
                        <p className="mb-2 text-[11px] text-neutral-600">My actions</p>
                        <div className="flex items-center gap-3">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isInActions}
                              onChange={(e) => onToggleInActions(noteId, e.target.checked)}
                              className="h-3.5 w-3.5 rounded accent-indigo-500"
                            />
                            <span className="text-xs text-neutral-400">Track in My Actions</span>
                          </label>
                          {isInActions && (
                            <Link href="/actions" className="text-[11px] text-indigo-400 transition-colors hover:text-indigo-300">
                              View →
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Notes to self — auto-grows, never clips */}
                      <div>
                        <p className="mb-1.5 text-[11px] text-neutral-600">Notes to self</p>
                        <AutoTextarea
                          className="w-full rounded-lg bg-neutral-800/40 px-3 py-2 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:bg-neutral-800/60 focus:ring-1 focus:ring-neutral-700/50"
                          placeholder="Private notes…"
                          value={personalReminder}
                          onChange={(e) => handlePersonalReminderChange(e.target.value)}
                        />
                      </div>

                      {/* Linked emails */}
                      <div ref={emailsRef}>
                        <p className="mb-1.5 text-[11px] text-neutral-600">
                          Linked emails{emailThreads.length > 0 ? ` (${emailThreads.length})` : ""}
                        </p>
                        {emailThreadsLoading ? (
                          <p className="text-[11px] text-neutral-700">Loading…</p>
                        ) : emailThreads.length === 0 ? (
                          <p className="text-[11px] text-neutral-700">No linked emails</p>
                        ) : (
                          <div className="space-y-1">
                            {emailThreads.map((thread) => {
                              const threadAttachments = attachmentMap[thread.id];
                              return (
                                <div key={thread.id} className="rounded-lg bg-neutral-800/30 px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <p className="min-w-0 flex-1 truncate text-[11px] text-neutral-400">
                                      ✉ {thread.subject ?? "Email thread"}
                                    </p>
                                    <button
                                      type="button"
                                      disabled={connectingThreadId !== null || emailSignInRedirecting !== null}
                                      onClick={() => void handleOpenThread(thread)}
                                      className="shrink-0 text-[11px] text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50"
                                    >
                                      {emailSignInRedirecting === thread.id ? "…" : connectingThreadId === thread.id ? "…" : "Open →"}
                                    </button>
                                    <button
                                      type="button"
                                      className="shrink-0 text-[11px] text-neutral-700 hover:text-red-400"
                                      onClick={() => handleUnlinkThread(thread.id)}
                                    >×</button>
                                  </div>
                                  {emailOpenError?.threadId === thread.id && (
                                    <p className="mt-1 text-[10px] text-red-400">{emailOpenError.msg}</p>
                                  )}
                                  {threadAttachments && threadAttachments.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {threadAttachments.map((att) => (
                                        <span key={att.id} className="max-w-[120px] truncate rounded border border-neutral-700 bg-neutral-800/60 px-1.5 py-0.5 text-[10px] text-neutral-500">
                                          📎 {att.file_name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Context — Attachments + Links */}
                <div>
                  <p className="mb-2 text-[11px] font-medium text-neutral-600">Context</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAttachments((v) => !v)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition-colors ${showAttachments ? "bg-neutral-800 text-neutral-200" : "bg-neutral-900/60 text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300"}`}
                    >
                      <span>📎</span>
                      <span>Attachments</span>
                      {noteAttachments.length > 0 && (
                        <span className="text-neutral-500">{noteAttachments.length}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLinks((v) => !v)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition-colors ${showLinks ? "bg-neutral-800 text-neutral-200" : "bg-neutral-900/60 text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300"}`}
                    >
                      <span>🔗</span>
                      <span>Links</span>
                      {noteLinks.length > 0 && (
                        <span className="text-neutral-500">{noteLinks.length}</span>
                      )}
                    </button>
                  </div>

                  {/* Attachments panel */}
                  {showAttachments && (
                    <div className="mt-2 space-y-0.5 rounded-xl bg-neutral-900/40 px-3 py-2.5">
                      {noteAttachments.map((att) => {
                        const ft = fileTypeLabel(att.mime_type, att.file_name);
                        return (
                          <div key={att.id} className="group -mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-neutral-800/40">
                            <span className={`w-7 shrink-0 text-center font-mono text-[9px] font-bold tracking-wider ${ft.color}`}>{ft.abbr}</span>
                            <button
                              type="button"
                              onClick={() => setPreviewAttachment(att)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="block truncate text-[11px] font-medium text-neutral-300 transition-colors group-hover:text-neutral-100">{att.file_name}</span>
                              {att.file_size != null && (
                                <span className="block text-[10px] text-neutral-700">{fmtFileSize(att.file_size)}</span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteAttachment(att)}
                              className="shrink-0 text-[11px] text-neutral-800 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                              aria-label="Remove attachment"
                            >×</button>
                          </div>
                        );
                      })}
                      {uploadingFile && (
                        <p className="px-1.5 text-[11px] text-neutral-600">Uploading…</p>
                      )}
                      <label className="mt-0.5 flex cursor-pointer items-center gap-1 px-1.5 py-1">
                        <input
                          type="file"
                          className="sr-only"
                          disabled={uploadingFile}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUploadFile(file);
                            e.target.value = "";
                          }}
                        />
                        <span className="text-[11px] text-neutral-700 transition-colors hover:text-neutral-400">
                          + Add file
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Links panel */}
                  {showLinks && (
                    <div className="mt-2 space-y-0.5 rounded-xl bg-neutral-900/40 px-3 py-2.5">
                      {noteLinks.map((link) => {
                        const provider = detectProvider(link.url);
                        const host = linkHostname(link.url);
                        const label = link.title || host;
                        const sub = link.title ? (provider ?? host) : provider;
                        return (
                          <div key={link.id} className="group -mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-neutral-800/40">
                            <button
                              type="button"
                              onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="block truncate text-[11px] font-medium text-indigo-400 transition-colors group-hover:text-indigo-300">{label}</span>
                              {sub && (
                                <span className="block truncate text-[10px] text-neutral-600">{sub}</span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteLink(link.id)}
                              className="shrink-0 text-[11px] text-neutral-800 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                              aria-label="Remove link"
                            >×</button>
                          </div>
                        );
                      })}
                      {/* Add link form */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          className="min-w-0 flex-1 rounded-lg bg-neutral-800/60 px-2 py-1 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-neutral-700"
                          placeholder="https://…"
                          value={newLinkUrl}
                          onChange={(e) => setNewLinkUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") void handleAddLink(); }}
                        />
                        <input
                          className="w-24 shrink-0 rounded-lg bg-neutral-800/60 px-2 py-1 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-neutral-700"
                          placeholder="Label (opt)"
                          value={newLinkTitle}
                          onChange={(e) => setNewLinkTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") void handleAddLink(); }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleAddLink()}
                          disabled={addingLinkRow || !newLinkUrl.trim()}
                          className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {addingLinkRow ? "…" : "Add"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Link-to-board form (opened from kebab menu) */}
                {showLinkForm && onLinkToBoard && (
                  <div className="rounded-xl bg-neutral-900/40 p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-medium text-neutral-400">Link to board</p>
                      <button type="button" className="text-xs text-neutral-600 hover:text-neutral-300" onClick={() => { setShowLinkForm(false); setLinkBoardId(""); setLinkColumns([]); setLinkColumnId(""); }}>✕</button>
                    </div>
                    <div className="space-y-2">
                      <select className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-600" value={linkBoardId} onChange={(e) => handleLinkBoardChange(e.target.value)}>
                        <option value="">Select board…</option>
                        {otherBoards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      {linkBoardId && (
                        linkColumnsLoading ? (
                          <p className="text-xs text-neutral-600">Loading columns…</p>
                        ) : linkColumns.length === 0 ? (
                          <p className="text-xs text-neutral-500">No columns on this board.</p>
                        ) : (
                          <select className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-600" value={linkColumnId} onChange={(e) => setLinkColumnId(e.target.value)}>
                            {linkColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )
                      )}
                      {linkSuccess ? (
                        <p className="text-xs text-green-500">Linked successfully!</p>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50" onClick={handleLink} disabled={linking || !linkBoardId || !linkColumnId}>{linking ? "Linking…" : "Link"}</button>
                          <button type="button" className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200" onClick={() => { setShowLinkForm(false); setLinkBoardId(""); setLinkColumns([]); setLinkColumnId(""); }}>Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>{/* end left column */}

            {/* ── RIGHT RAIL — Activity only ── */}
            <div className="flex w-72 flex-shrink-0 flex-col border-l border-neutral-800/40 bg-neutral-900/20">
              <div className="border-b border-neutral-800/40 px-4 py-3">
                <p className="text-[11px] font-medium text-neutral-600">Activity</p>
              </div>

              {/* Composer */}
              <div className="border-b border-neutral-800/30 px-4 py-3">
                {collabAuthed === false ? (
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-neutral-600">Sign in to comment.</p>
                    <Link href="/login" className="text-xs text-indigo-400 hover:text-indigo-300">Sign in →</Link>
                  </div>
                ) : (
                  <div className="rounded-lg bg-neutral-800/40 px-3 py-2 transition-colors focus-within:bg-neutral-800/60 focus-within:ring-1 focus-within:ring-neutral-700/40">
                    <AutoTextarea
                      className="w-full bg-transparent text-xs text-neutral-200 outline-none placeholder:text-neutral-600"
                      placeholder="Write a comment…"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSubmitComposer();
                        }
                      }}
                      disabled={addingComment}
                    />
                    {(newComment.trim() || composerStatusChange) && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <select
                          className="bg-transparent text-[11px] text-neutral-600 outline-none"
                          value={composerStatusChange ?? ""}
                          onChange={(e) => setComposerStatusChange((e.target.value as NoteStatus) || null)}
                        >
                          <option value="">Status…</option>
                          {STATUS_VALUES.filter((s) => s !== "done").map((s) => (
                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="ml-auto rounded-md bg-indigo-600 px-2.5 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
                          onClick={handleSubmitComposer}
                          disabled={addingComment || (!newComment.trim() && !composerStatusChange)}
                        >
                          {addingComment ? "…" : "Send"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Feed — newest first, scrollable */}
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {collabLoading ? (
                  <p className="px-2 py-3 text-[11px] text-neutral-700">Loading…</p>
                ) : feedEntries.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-neutral-700">No activity yet.</p>
                ) : (
                  <div className="space-y-0.5">
                    {feedEntries.map((entry) => {
                      if (entry.kind === "comment") {
                        const c = entry.data;
                        return (
                          <div key={c.id} className="group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-800/30">
                            <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-900/50">
                              <span className="text-[8px] text-indigo-400">✦</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-xs text-neutral-200">{c.content}</p>
                              <p className="mt-0.5 text-[10px] text-neutral-700">{relativeTime(c.created_at)}</p>
                            </div>
                            <button
                              type="button"
                              className="mt-0.5 shrink-0 text-[10px] text-neutral-700 opacity-0 hover:text-red-400 group-hover:opacity-100"
                              onClick={() => handleDeleteComment(c.id)}
                              aria-label="Delete"
                            >✕</button>
                          </div>
                        );
                      }
                      if (entry.kind === "local") {
                        return (
                          <p key={entry.id} className="px-2 py-1 text-[11px] italic text-neutral-700">
                            {entry.text} · just now
                          </p>
                        );
                      }
                      const a = entry.data;
                      return (
                        <p key={a.id} className="px-2 py-1 text-[11px] text-neutral-700">
                          {formatActivity(a)} · {relativeTime(a.created_at)}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>{/* end right rail */}
          </div>
        ) : (
          /* ── OLD body layout (revert by setting NEW_CARD_LAYOUT = false) ── */
          <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-4 p-5">
                <AutoTextarea
                  className="w-full bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
                  placeholder="Add a description…"
                  value={description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                />
                <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/30" ref={emailsRef}>
                  <div className="p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-neutral-500">Emails</span>
                    </div>
                    {emailThreadsLoading ? (
                      <p className="text-[11px] text-neutral-700">Loading…</p>
                    ) : emailThreads.length === 0 ? (
                      <p className="text-[11px] text-neutral-700">No linked emails yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {emailThreads.map((thread) => {
                          const threadAttachments = attachmentMap[thread.id];
                          return (
                            <div key={thread.id} className="rounded border border-neutral-800/50 px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <p className="min-w-0 flex-1 truncate text-[11px] text-neutral-400">✉ {thread.subject ?? "Email thread"}</p>
                                <button type="button" disabled={connectingThreadId !== null || emailSignInRedirecting !== null} onClick={() => void handleOpenThread(thread)} className="shrink-0 text-[11px] text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50">
                                  {emailSignInRedirecting === thread.id ? "…" : connectingThreadId === thread.id ? "…" : "Open →"}
                                </button>
                                <button type="button" className="shrink-0 text-[11px] text-neutral-700 transition-colors hover:text-red-400" onClick={() => handleUnlinkThread(thread.id)}>×</button>
                              </div>
                              {emailOpenError?.threadId === thread.id && <p className="mt-0.5 text-[10px] text-red-400">{emailOpenError.msg}</p>}
                              {threadAttachments && threadAttachments.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {threadAttachments.map((att) => <span key={att.id} className="max-w-[100px] truncate rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-[10px] text-neutral-500">📎 {att.file_name}</span>)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-neutral-800/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">Attachments</span>
                      <button type="button" className="text-[11px] text-neutral-700 hover:text-neutral-400" onClick={() => alert("File attachments coming soon")}>+ Add</button>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/30">
                  <div className="border-b border-neutral-800/60 px-3 pb-2 pt-3">
                    <span className="text-xs text-neutral-500">Updates</span>
                  </div>
                  {collabLoading ? <p className="p-3 text-xs text-neutral-600">Loading…</p> : collabAuthed === false ? (
                    <div className="flex items-center gap-1.5 p-3">
                      <p className="text-xs text-neutral-600">Sign in to post updates.</p>
                      <Link href="/login" className="text-xs text-indigo-400 transition-colors hover:text-indigo-300">Sign in →</Link>
                    </div>
                  ) : (
                    <div className="space-y-3 p-3">
                      <div className="overflow-hidden rounded-lg border border-neutral-800 transition-colors focus-within:border-neutral-700">
                        <AutoTextarea className="w-full bg-transparent px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600" placeholder="Write a comment…" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmitComposer(); } }} disabled={addingComment} />
                        <div className="flex items-center gap-2 border-t border-neutral-800/60 px-2 py-1.5">
                          <select className="bg-transparent px-1 py-0.5 text-xs text-neutral-600 outline-none" value={composerStatusChange ?? ""} onChange={(e) => setComposerStatusChange((e.target.value as NoteStatus) || null)}>
                            <option value="">Status…</option>
                            {STATUS_VALUES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                          </select>
                          <button type="button" className="ml-auto rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50" onClick={handleSubmitComposer} disabled={addingComment || (!newComment.trim() && !composerStatusChange)}>{addingComment ? "…" : "Send"}</button>
                        </div>
                      </div>
                      {feedEntries.length > 0 && (
                        <div className="space-y-1">
                          {feedEntries.map((entry) => {
                            if (entry.kind === "comment") {
                              const c = entry.data;
                              return (
                                <div key={c.id} className="group flex items-start gap-2 py-1">
                                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800"><span className="text-[10px] text-neutral-500">✦</span></div>
                                  <div className="min-w-0 flex-1"><p className="break-words text-sm text-neutral-200">{c.content}</p><p className="mt-0.5 text-[10px] text-neutral-600">{relativeTime(c.created_at)}</p></div>
                                  <button type="button" className="mt-1 shrink-0 text-xs text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100" onClick={() => handleDeleteComment(c.id)} aria-label="Delete comment">✕</button>
                                </div>
                              );
                            }
                            if (entry.kind === "local") {
                              return <p key={entry.id} className="py-0.5 text-[11px] italic text-neutral-700">{entry.text} · just now</p>;
                            }
                            const a = entry.data;
                            return <p key={a.id} className="py-0.5 text-[11px] text-neutral-600">{formatActivity(a)} · {relativeTime(a.created_at)}</p>;
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3 border-t border-neutral-800 pt-4">
                  {onLinkToBoard && otherBoards.length > 0 && (
                    <>{!showLinkForm ? <button type="button" className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200" onClick={() => setShowLinkForm(true)}>🔗 Link to another board…</button> : <div className="space-y-2.5 rounded-md border border-neutral-800 bg-neutral-900 p-3"><p className="text-xs font-medium text-neutral-400">Link to board</p><select className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-600" value={linkBoardId} onChange={(e) => handleLinkBoardChange(e.target.value)}><option value="">Select board…</option>{otherBoards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>{linkBoardId && (<>{linkColumnsLoading ? <p className="text-xs text-neutral-600">Loading columns…</p> : linkColumns.length === 0 ? <p className="text-xs text-neutral-500">No columns on this board.</p> : <select className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-600" value={linkColumnId} onChange={(e) => setLinkColumnId(e.target.value)}>{linkColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</>)}{linkSuccess ? <p className="text-xs text-green-500">Linked successfully!</p> : <div className="flex gap-2"><button type="button" className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50" onClick={handleLink} disabled={linking || !linkBoardId || !linkColumnId}>{linking ? "Linking…" : "Link"}</button><button type="button" className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200" onClick={() => { setShowLinkForm(false); setLinkBoardId(""); setLinkColumns([]); setLinkColumnId(""); }}>Cancel</button></div>}</div>}</>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${archived ? "border-green-700 text-green-400 hover:bg-green-900/20" : "border-neutral-700 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"}`} onClick={handleArchiveToggle}>{archived ? "Restore from Archive" : "Archive Card"}</button>
                    <button type="button" className="text-xs text-neutral-700 transition-colors hover:text-red-400" onClick={handleDeleteEverywhere}>Delete everywhere</button>
                  </div>
                </div>
              </div>
            </div>
            <div className={`flex-shrink-0 border-t border-neutral-800 transition-all duration-200 md:border-l md:border-t-0 ${panelOpen ? "md:w-64" : "md:w-9"}`}>
              <div className="flex items-center border-b border-neutral-800 px-2.5 py-2">
                <button type="button" onClick={togglePanel} className="text-[11px] text-neutral-600 transition-colors hover:text-neutral-400">{panelOpen ? "Workspace ›" : "‹"}</button>
              </div>
              {panelOpen && (
                <div className="space-y-4 p-3">
                  <div className="space-y-1">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={isInActions} onChange={(e) => onToggleInActions(noteId, e.target.checked)} className="h-3.5 w-3.5 rounded border-neutral-700 accent-indigo-500" />
                      <span className="text-xs text-neutral-400">Add to My Actions</span>
                    </label>
                    {isInActions && <Link href="/actions" className="block text-[11px] text-indigo-400 transition-colors hover:text-indigo-300">View in Actions →</Link>}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-neutral-500">Personal Notes</p>
                    <AutoTextarea className="w-full rounded-md border border-neutral-800/60 bg-transparent px-2.5 py-1.5 text-xs text-neutral-200 outline-none placeholder:text-neutral-700 focus:border-neutral-700" placeholder="Private note…" value={personalReminder} onChange={(e) => handlePersonalReminderChange(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}{/* end body */}
      </div>{/* end panel */}
      {previewAttachment && (
        <AttachmentPreviewModal
          attachment={previewAttachment}
          noteId={noteId}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
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
      return `Status changed to ${STATUS_META[p.to as NoteStatus]?.label ?? p.to}`;
    case "due_date_changed":
      return p.value === "cleared" || !p.value ? "Due date cleared" : `Due date set to ${p.value}`;
    case "update_posted":
      return "Update posted";
    default:
      return a.activity_type;
  }
}

// "2h ago", "45m ago", "3d ago"
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
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

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(mime: string | null, fileName: string): { abbr: string; color: string } {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image/") || ["jpg","jpeg","png","gif","svg","webp","avif"].includes(ext))
    return { abbr: "IMG", color: "text-green-500" };
  if (mime === "application/pdf" || ext === "pdf")
    return { abbr: "PDF", color: "text-red-400" };
  if (["doc","docx"].includes(ext) || mime?.includes("wordprocessingml"))
    return { abbr: "DOC", color: "text-blue-400" };
  if (["xls","xlsx"].includes(ext) || mime?.includes("spreadsheetml"))
    return { abbr: "XLS", color: "text-emerald-400" };
  if (["ppt","pptx"].includes(ext) || mime?.includes("presentationml"))
    return { abbr: "PPT", color: "text-orange-400" };
  if (["txt","md"].includes(ext) || mime === "text/plain")
    return { abbr: "TXT", color: "text-neutral-400" };
  if (["zip","gz","tar","rar","7z"].includes(ext))
    return { abbr: "ZIP", color: "text-purple-400" };
  if (["mp4","mov","avi","webm"].includes(ext) || mime?.startsWith("video/"))
    return { abbr: "VID", color: "text-yellow-400" };
  if (["mp3","wav","m4a","ogg"].includes(ext) || mime?.startsWith("audio/"))
    return { abbr: "AUD", color: "text-pink-400" };
  return { abbr: "FILE", color: "text-neutral-500" };
}

function detectProvider(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "drive.google.com" || host === "docs.google.com" || host === "sheets.google.com" || host === "slides.google.com") return "Google Drive";
    if (host.includes("box.com")) return "Box";
    if (host.includes("sharepoint.com") || host.includes("1drv.ms")) return "SharePoint";
    if (host.includes("dropbox.com")) return "Dropbox";
    return null;
  } catch { return null; }
}

function linkHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function AutoTextarea({
  value,
  onChange,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      className={className}
      style={{ overflow: "hidden", resize: "none" }}
      rows={1}
      {...props}
    />
  );
}
