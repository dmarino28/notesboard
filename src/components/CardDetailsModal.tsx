"use client";

import { useState, useEffect, useRef } from "react";
import { NoteRow, NoteFieldUpdates, updateNoteFields } from "@/lib/notes";
import {
  LabelRow,
  listNoteLabels,
  attachLabel,
  detachLabel,
  createLabel,
} from "@/lib/labels";
import { CommentRow, listComments, addComment, deleteComment } from "@/lib/comments";

type Props = {
  note: NoteRow;
  boardId: string;
  boardLabels: LabelRow[];
  onClose: () => void;
  onNoteChange: (id: string, fields: Partial<NoteRow>) => void;
  onLabelCreated: (label: LabelRow) => void;
  onNoteLabelsChanged: (noteId: string, labels: LabelRow[]) => void;
  onError: (msg: string) => void;
};

export function CardDetailsModal({
  note,
  boardId,
  boardLabels,
  onClose,
  onNoteChange,
  onLabelCreated,
  onNoteLabelsChanged,
  onError,
}: Props) {
  // --- Local field state (one-way from prop; parent updated via onNoteChange) ---
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

  // --- Debounced save ---
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<NoteFieldUpdates>({});

  // --- Animation ---
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Lazy-load labels and comments
  useEffect(() => {
    listNoteLabels(note.id).then(({ data }) => {
      setNoteLabels(data);
      setLabelsLoading(false);
    });
    listComments(note.id).then(({ data }) => {
      setComments(data);
      setCommentsLoading(false);
    });
  }, [note.id]);

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

  // Initialize local fields only when a different card is opened (note.id changes).
  // Do NOT resync on individual field changes — that clobbers the date picker while the user
  // is interacting with it (focus loss / picker closes).
  useEffect(() => {
    setTitle(note.content);
    setDescription(note.description ?? "");
    setDueDate(note.due_date ? toDatetimeLocal(note.due_date) : "");
    setEventStart(note.event_start ? toDatetimeLocal(note.event_start) : "");
    setEventEnd(note.event_end ? toDatetimeLocal(note.event_end) : "");
    setArchived(note.archived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // ------------------------------------------------------------------ helpers

  function triggerClose() {
    // Flush any pending debounced save synchronously
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = {};
      if (Object.keys(pending).length > 0) {
        void updateNoteFields(note.id, pending);
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
      const { error } = await updateNoteFields(note.id, toSave);
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
    onNoteChange(note.id, { content: v });
    scheduleFieldSave({ content: v });
  }

  function handleDescriptionChange(v: string) {
    setDescription(v);
    onNoteChange(note.id, { description: v || null });
    scheduleFieldSave({ description: v || null });
  }

  function handleDueDateChange(v: string) {
    setDueDate(v);
    const iso = v ? new Date(v).toISOString() : null;
    onNoteChange(note.id, { due_date: iso });
    scheduleFieldSave({ due_date: iso });
  }

  function handleEventStartChange(v: string) {
    setEventStart(v);
    const iso = v ? new Date(v).toISOString() : null;
    onNoteChange(note.id, { event_start: iso });
    scheduleFieldSave({ event_start: iso });
  }

  function handleEventEndChange(v: string) {
    setEventEnd(v);
    const iso = v ? new Date(v).toISOString() : null;
    onNoteChange(note.id, { event_end: iso });
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
    onNoteChange(note.id, { archived: newArchived });

    const { error } = await updateNoteFields(note.id, { archived: newArchived });
    if (error) {
      setArchived(!newArchived);
      onNoteChange(note.id, { archived: !newArchived });
      onError(`Failed to ${newArchived ? "archive" : "restore"} note`);
      return;
    }

    triggerClose();
  }

  // ------------------------------------------------------------------ labels

  async function handleAttachLabel(labelId: string) {
    const label = boardLabels.find((l) => l.id === labelId);
    if (!label || noteLabels.some((l) => l.id === labelId)) return;
    const updated = [...noteLabels, label];
    setNoteLabels(updated);
    onNoteLabelsChanged(note.id, updated);

    const { error } = await attachLabel(note.id, labelId);
    if (error) {
      const reverted = updated.filter((l) => l.id !== labelId);
      setNoteLabels(reverted);
      onNoteLabelsChanged(note.id, reverted);
      onError("Failed to attach label");
    }
  }

  async function handleDetachLabel(labelId: string) {
    const updated = noteLabels.filter((l) => l.id !== labelId);
    setNoteLabels(updated);
    onNoteLabelsChanged(note.id, updated);

    const { error } = await detachLabel(note.id, labelId);
    if (error) {
      const reverted = [...updated, boardLabels.find((l) => l.id === labelId)!].filter(Boolean);
      setNoteLabels(reverted);
      onNoteLabelsChanged(note.id, reverted);
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
    onNoteLabelsChanged(note.id, updated);
    await attachLabel(note.id, data.id);
  }

  // ------------------------------------------------------------------ comments

  async function handleAddComment() {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    setAddingComment(true);
    const optimistic: CommentRow = {
      id: `temp-${Date.now()}`,
      note_id: note.id,
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setNewComment("");

    const { data, error } = await addComment(note.id, trimmed);
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
          {/* Description */}
          <section>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">
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
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Due Date</label>
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

          {/* Event Range */}
          <section>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Event</label>
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
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Labels</label>
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
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={newLabelColor}
                          onChange={(e) => setNewLabelColor(e.target.value)}
                          className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                          title="Label color"
                        />
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
                          className="rounded bg-white px-2 py-1 text-xs font-medium text-black disabled:opacity-50"
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

          {/* Comments */}
          <section>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Comments</label>
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
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
                    onClick={handleAddComment}
                    disabled={addingComment || !newComment.trim()}
                  >
                    {addingComment ? "…" : "Add"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Archive */}
          <section className="border-t border-neutral-800 pt-4">
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
          </section>
        </div>
      </div>
    </div>
  );
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
