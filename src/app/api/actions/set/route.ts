import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";

type RequestBody = {
  note_id: string;
  // Explicit remove
  in_my_actions?: boolean;
  // Settable fields
  action_state?: string;
  action_mode?: string;
  personal_due_date?: string | null;
  private_tags?: string[];
};

type RowShape = {
  action_state: string;
  action_mode: string;
  personal_due_date: string | null;
  private_tags: string[];
};

const VALID_STATES = ["needs_action", "waiting", "done"];
const VALID_MODES = ["timed", "flagged"];

export async function POST(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { client, user } = auth;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { note_id, in_my_actions, action_state, action_mode, personal_due_date, private_tags } = body;
  if (!note_id) {
    return NextResponse.json({ error: "note_id required" }, { status: 400 });
  }

  // Explicit remove: in_my_actions: false OR action_state: "none"
  const shouldRemove = in_my_actions === false || action_state === "none";
  if (shouldRemove) {
    const { error } = await client
      .from("note_user_actions")
      .delete()
      .eq("user_id", user.id)
      .eq("note_id", note_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  }

  // Validate provided fields
  if (action_state !== undefined && !VALID_STATES.includes(action_state)) {
    return NextResponse.json({ error: "Invalid action_state" }, { status: 400 });
  }
  if (action_mode !== undefined && !VALID_MODES.includes(action_mode)) {
    return NextResponse.json({ error: "Invalid action_mode" }, { status: 400 });
  }

  // Path A: action_state provided → upsert (create or update)
  if (action_state !== undefined) {
    const upsertData: Record<string, unknown> = {
      user_id: user.id,
      note_id,
      action_state,
      personal_due_date: personal_due_date ?? null,
      updated_at: new Date().toISOString(),
    };
    if (action_mode !== undefined) upsertData.action_mode = action_mode;
    if (private_tags !== undefined) upsertData.private_tags = private_tags;

    const { data, error } = await client
      .from("note_user_actions")
      .upsert(upsertData, { onConflict: "user_id,note_id" })
      .select("action_state, action_mode, personal_due_date, private_tags")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const row = data as RowShape;
    return NextResponse.json({
      action_state: row.action_state,
      action_mode: row.action_mode,
      personal_due_date: row.personal_due_date,
      private_tags: row.private_tags,
    });
  }

  // Path B: Partial update — only updates the provided subset of fields
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (personal_due_date !== undefined) patch.personal_due_date = personal_due_date;
  if (private_tags !== undefined) patch.private_tags = private_tags;
  if (action_mode !== undefined) patch.action_mode = action_mode;

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ noop: true });
  }

  const { data, error } = await client
    .from("note_user_actions")
    .update(patch)
    .eq("user_id", user.id)
    .eq("note_id", note_id)
    .select("action_state, action_mode, personal_due_date, private_tags")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as RowShape;
  return NextResponse.json({
    action_state: row.action_state,
    action_mode: row.action_mode,
    personal_due_date: row.personal_due_date,
    private_tags: row.private_tags,
  });
}
