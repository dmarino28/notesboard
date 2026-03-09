import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { maxPlacementPosition } from "@/lib/placements";
import {
  upsertEmailThreadForNote,
  upsertAttachments,
} from "@/lib/emailThreads";

type RequestBody = {
  title: string;
  boardId: string;
  columnId: string;
  provider?: string;
  mailbox?: string | null;
  conversationId: string;
  messageId?: string | null;
  webLink?: string | null;
  subject?: string | null;
  lastActivityAt?: string | null;
  unreadCount?: number;
  attachments?: { messageId: string; fileName: string }[];
  /**
   * Optional: when set, creates a note_user_actions row for the creating user.
   * Scoped entirely to the current user — does not touch shared card fields.
   */
  action_state?: "needs_action" | "waiting" | "done";
  /** ISO YYYY-MM-DD — stored as personal_due_date on note_user_actions only */
  personal_due_date?: string | null;
};

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, user } = auth;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, boardId, columnId, conversationId } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!boardId) {
    return NextResponse.json({ error: "boardId is required" }, { status: 400 });
  }
  if (!columnId) {
    return NextResponse.json({ error: "columnId is required" }, { status: 400 });
  }
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  // ── Region from profile ───────────────────────────────────────────────────────
  const { data: profile } = await client
    .from("profiles")
    .select("primary_region, regions")
    .eq("id", user.id)
    .single();
  const region =
    profile?.primary_region ??
    (Array.isArray(profile?.regions) && profile.regions.length ? profile.regions[0] : null) ??
    "global";

  // 1. Compute next position in column
  const position = (await maxPlacementPosition(boardId, columnId)) + 1;

  // 2. Create note — visibility='shared' because captured email threads are shared by default
  const { data: note, error: noteErr } = await client
    .from("notes")
    .insert([{
      content: title.trim(),
      column_id: columnId,
      position,
      board_id: boardId,
      visibility: "shared",
      region,
      created_by: user.id,
    }])
    .select("id, content")
    .single();
  if (noteErr || !note) {
    return NextResponse.json(
      { error: noteErr?.message ?? "Failed to create note" },
      { status: 500 },
    );
  }

  // 3. Create placement and retrieve its id
  const { data: placementData, error: placementErr } = await client
    .from("note_placements")
    .insert([{ note_id: note.id, board_id: boardId, column_id: columnId, position }])
    .select("id")
    .single();

  if (placementErr || !placementData) {
    return NextResponse.json(
      { error: placementErr?.message ?? "Failed to create placement" },
      { status: 500 },
    );
  }

  const placementId = (placementData as { id: string }).id;

  // 4. Upsert email thread (non-fatal if it fails)
  const { data: thread, error: threadErr } = await upsertEmailThreadForNote({
    noteId: note.id,
    provider: body.provider ?? "outlook",
    mailbox: body.mailbox ?? null,
    conversationId,
    messageId: body.messageId ?? null,
    webLink: body.webLink ?? null,
    subject: body.subject ?? null,
    lastActivityAt: body.lastActivityAt ?? null,
    unreadCount: body.unreadCount ?? 0,
  });
  if (threadErr) {
    console.error("Failed to upsert email thread:", threadErr);
  }

  // 5. Upsert attachments if any
  if (thread && body.attachments && body.attachments.length > 0) {
    const { error: attErr } = await upsertAttachments(thread.id, body.attachments);
    if (attErr) {
      console.error("Failed to upsert attachments:", attErr);
    }
  }

  // 6. Optionally create a personal action row for the creating user (non-fatal).
  //    This only writes to note_user_actions — no shared card fields are touched.
  if (body.action_state) {
    const actionRow: Record<string, unknown> = {
      user_id: user.id,
      note_id: note.id,
      action_state: body.action_state,
      action_mode: "timed",
      is_in_actions: true,
      updated_at: new Date().toISOString(),
    };
    if (body.personal_due_date !== undefined) {
      actionRow.personal_due_date = body.personal_due_date ?? null;
    }
    const { error: actionErr } = await client
      .from("note_user_actions")
      .upsert(actionRow, { onConflict: "user_id,note_id" });
    if (actionErr) {
      console.error("Failed to create note_user_actions:", actionErr);
    }
  }

  return NextResponse.json({ noteId: note.id, placementId });
}
