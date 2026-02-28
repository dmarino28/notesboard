import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";

type RequestBody = {
  content: string;
  status_change?: string | null;
  due_date_change?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { client, user } = auth;

  const { noteId } = await params;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { content, status_change, due_date_change } = body;
  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (content.trim().length > 500) {
    return NextResponse.json({ error: "Update too long (max 500 chars)" }, { status: 400 });
  }

  // Fetch current status for activity "from" value
  let prevStatus: string | null = null;
  if (status_change) {
    const { data: noteData } = await client
      .from("notes")
      .select("status")
      .eq("id", noteId)
      .maybeSingle();
    prevStatus = (noteData as { status: string | null } | null)?.status ?? null;
  }

  // 1. Insert update row — trigger fires and syncs notes.last_public_activity_* automatically
  const { error: updateErr } = await client.from("note_updates").insert({
    note_id: noteId,
    user_id: user.id,
    content: content.trim(),
    status_change: status_change ?? null,
    due_date_change: due_date_change ?? null,
  });
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 2. Apply field changes to notes (status / due_date only — last_public_activity_* is
  //    handled by the note_updates_sync_activity_tg trigger above)
  const noteFieldUpdates: Record<string, unknown> = {};
  if (status_change) noteFieldUpdates.status = status_change;
  if (due_date_change !== undefined) {
    noteFieldUpdates.due_date = due_date_change === "cleared" ? null : due_date_change;
  }

  if (Object.keys(noteFieldUpdates).length > 0) {
    const { error: noteErr } = await client
      .from("notes")
      .update(noteFieldUpdates)
      .eq("id", noteId);
    if (noteErr) {
      return NextResponse.json({ error: noteErr.message }, { status: 500 });
    }
  }

  // 3. Log activity events (status change + optional due_date change)
  const activityRows: {
    note_id: string;
    actor_user_id: string;
    activity_type: string;
    payload: object;
  }[] = [];

  if (status_change) {
    activityRows.push({
      note_id: noteId,
      actor_user_id: user.id,
      activity_type: "status_changed",
      payload: { from: prevStatus, to: status_change },
    });
  }
  if (due_date_change !== undefined) {
    activityRows.push({
      note_id: noteId,
      actor_user_id: user.id,
      activity_type: "due_date_changed",
      payload: { value: due_date_change },
    });
  }

  if (activityRows.length > 0) {
    await client.from("note_activity").insert(activityRows);
  }

  return NextResponse.json({ ok: true });
}
