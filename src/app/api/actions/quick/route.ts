import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import type { ActionState, ActionMode } from "@/lib/userActions";

const VALID_STATES: ActionState[] = ["needs_action", "waiting", "done"];
const VALID_MODES: ActionMode[] = ["timed", "flagged"];

export async function POST(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, user } = auth;

  const body = await req.json().catch(() => null);

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  const action_state: ActionState = VALID_STATES.includes(body?.action_state)
    ? body.action_state
    : "needs_action";
  const action_mode: ActionMode = VALID_MODES.includes(body?.action_mode)
    ? body.action_mode
    : "timed";
  // due_date for the note (YYYY-MM-DD or null) — canonical, goes on notes.due_date
  const due_date: string | null =
    typeof body?.due_date === "string" && body.due_date ? body.due_date : null;
  const private_tags = Array.isArray(body?.private_tags)
    ? (body.private_tags as unknown[]).filter((t) => typeof t === "string")
    : [];

  // 1. Create the note with due_date on the notes row
  const { data: note, error: noteError } = await client
    .from("notes")
    .insert({ content: title, description, due_date })
    .select("id")
    .single();

  if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });

  // 2. Create the user action row (is_in_actions defaults to true)
  const { error: actionError } = await client.from("note_user_actions").insert({
    user_id: user.id,
    note_id: note.id,
    action_state,
    action_mode,
    private_tags,
  });

  if (actionError) {
    await client.from("notes").delete().eq("id", note.id);
    return NextResponse.json({ error: actionError.message }, { status: 500 });
  }

  return NextResponse.json({ note_id: note.id, action_state, action_mode, private_tags }, { status: 201 });
}
