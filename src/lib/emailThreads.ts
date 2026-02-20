import { supabase } from "./supabase";

export type EmailThreadRow = {
  id: string;
  note_id: string;
  provider: string;
  mailbox: string | null;
  conversation_id: string;
  message_id: string | null;
  web_link: string | null;
  subject: string | null;
  last_activity_at: string | null;
  unread_count: number;
  created_at: string;
};

export type AttachmentRow = {
  id: string;
  thread_id: string;
  message_id: string;
  file_name: string;
  created_at: string;
};

// ─── Threads ─────────────────────────────────────────────────────────────────

export async function listEmailThreadsForNote(
  noteId: string,
): Promise<{ data: EmailThreadRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("note_email_threads")
    .select(
      "id, note_id, provider, mailbox, conversation_id, message_id, web_link, subject, last_activity_at, unread_count, created_at",
    )
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  return { data: (data ?? []) as EmailThreadRow[], error: error?.message ?? null };
}

export async function upsertEmailThreadForNote(params: {
  noteId: string;
  provider?: string;
  mailbox?: string | null;
  conversationId: string;
  messageId?: string | null;
  webLink?: string | null;
  subject?: string | null;
  lastActivityAt?: string | null;
  unreadCount?: number;
}): Promise<{ data: EmailThreadRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("note_email_threads")
    .upsert(
      {
        note_id: params.noteId,
        provider: params.provider ?? "outlook",
        mailbox: params.mailbox ?? null,
        conversation_id: params.conversationId,
        message_id: params.messageId ?? null,
        web_link: params.webLink ?? null,
        subject: params.subject ?? null,
        last_activity_at: params.lastActivityAt ?? null,
        unread_count: params.unreadCount ?? 0,
      },
      { onConflict: "note_id,provider,conversation_id" },
    )
    .select()
    .single();

  return { data: (data as EmailThreadRow | null) ?? null, error: error?.message ?? null };
}

export async function deleteEmailThread(threadId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("note_email_threads").delete().eq("id", threadId);
  return { error: error?.message ?? null };
}

/**
 * Given a list of note_ids, returns the subset that have ≥1 email thread linked.
 * Used by the board page to drive the ✉️ card-tile icon.
 */
export async function listEmailThreadNoteIds(noteIds: string[]): Promise<Set<string>> {
  if (noteIds.length === 0) return new Set();
  const { data } = await supabase
    .from("note_email_threads")
    .select("note_id")
    .in("note_id", noteIds);

  const result = new Set<string>();
  for (const row of (data ?? []) as { note_id: string }[]) {
    result.add(row.note_id);
  }
  return result;
}

/**
 * Returns ALL cards that this conversation_id is linked to.
 * A single thread can be linked to multiple cards (many-to-many).
 * Returns an empty array if not linked anywhere.
 */
export async function listThreadLinksByConversationId(
  conversationId: string,
): Promise<{ noteId: string; noteTitle: string; boardId: string }[]> {
  const { data: threadRows } = await supabase
    .from("note_email_threads")
    .select("note_id")
    .eq("conversation_id", conversationId);

  if (!threadRows || threadRows.length === 0) return [];

  const noteIds = (threadRows as { note_id: string }[]).map((r) => r.note_id);

  const [{ data: notes }, { data: placements }] = await Promise.all([
    supabase.from("notes").select("id, content").in("id", noteIds),
    supabase.from("note_placements").select("note_id, board_id").in("note_id", noteIds),
  ]);

  const noteMap = new Map<string, string>();
  for (const n of (notes ?? []) as { id: string; content: string }[]) {
    noteMap.set(n.id, n.content);
  }

  const boardMap = new Map<string, string>();
  for (const p of (placements ?? []) as { note_id: string; board_id: string }[]) {
    if (!boardMap.has(p.note_id)) boardMap.set(p.note_id, p.board_id);
  }

  return noteIds.map((noteId) => ({
    noteId,
    noteTitle: noteMap.get(noteId) ?? "",
    boardId: boardMap.get(noteId) ?? "",
  }));
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export async function listAttachmentsForThread(
  threadId: string,
): Promise<{ data: AttachmentRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("note_email_attachments")
    .select("id, thread_id, message_id, file_name, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  return { data: (data ?? []) as AttachmentRow[], error: error?.message ?? null };
}

/**
 * Batch upsert attachments for a thread.
 * Inserts new rows; ignores conflicts on (thread_id, message_id, file_name) if they already exist.
 * Stub-ready: Phase 1 will wire real attachment data from Outlook API.
 */
export async function upsertAttachments(
  threadId: string,
  attachments: { messageId: string; fileName: string }[],
): Promise<{ error: string | null }> {
  if (attachments.length === 0) return { error: null };

  const rows = attachments.map((a) => ({
    thread_id: threadId,
    message_id: a.messageId,
    file_name: a.fileName,
  }));

  const { error } = await supabase.from("note_email_attachments").insert(rows);
  return { error: error?.message ?? null };
}
