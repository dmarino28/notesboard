import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";

/**
 * PATCH /api/notes/[noteId]/due
 * Body: { due_date: "YYYY-MM-DD" | null }
 *
 * 1. Updates notes.due_date.
 * 2. If due_date is non-null and no note_user_actions row exists yet,
 *    inserts one with action_state=needs_action and is_in_actions=true
 *    (INSERT ON CONFLICT DO NOTHING — does not override existing rows).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, user } = auth;

  const { noteId } = await params;

  const body = await req.json().catch(() => null);
  const due_date: string | null = typeof body?.due_date === "string" ? body.due_date : null;

  // 1. Update notes.due_date
  const { error: noteErr } = await client
    .from("notes")
    .update({ due_date })
    .eq("id", noteId);
  if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 });

  // 2. Auto-add to timed board on first due_date set — only if no row exists yet
  if (due_date) {
    await client
      .from("note_user_actions")
      .upsert(
        { user_id: user.id, note_id: noteId, action_state: "needs_action", is_in_actions: true },
        { onConflict: "user_id,note_id", ignoreDuplicates: true },
      );
  }

  return NextResponse.json({ due_date });
}
