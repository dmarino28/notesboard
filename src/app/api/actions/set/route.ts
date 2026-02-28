import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";

type RequestBody = {
  note_id: string;
  // Toggle timed-board visibility
  in_my_actions?: boolean;
  // Settable fields
  action_state?: string;
  action_mode?: string;
  is_in_actions?: boolean;
  private_tags?: string[];
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

  const { note_id, in_my_actions, action_state, action_mode, is_in_actions, private_tags } = body;
  if (!note_id) {
    return NextResponse.json({ error: "note_id required" }, { status: 400 });
  }

  // in_my_actions: false → set is_in_actions = false (keeps the row + action_state intact)
  if (in_my_actions === false) {
    const { error } = await client
      .from("note_user_actions")
      .update({ is_in_actions: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("note_id", note_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ removed: true });
  }

  // action_state: "none" → remove entirely (legacy hard-remove, e.g. "Remove from My Actions" opt-out)
  if (action_state === "none") {
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
      is_in_actions: true,
      updated_at: new Date().toISOString(),
    };
    if (action_mode !== undefined) upsertData.action_mode = action_mode;
    if (private_tags !== undefined) upsertData.private_tags = private_tags;

    // Auto-populate waiting fields when transitioning to 'waiting'
    if (action_state === "waiting") {
      const { data: thread } = await client
        .from("note_email_threads")
        .select("conversation_id, mailbox")
        .eq("note_id", note_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (thread) {
        const t = thread as { conversation_id: string; mailbox: string | null };
        upsertData.waiting_conversation_id = t.conversation_id;
        upsertData.waiting_since_at = new Date().toISOString();
        upsertData.waiting_mailbox = t.mailbox;
      }
    } else {
      upsertData.waiting_conversation_id = null;
      upsertData.waiting_since_at = null;
      upsertData.waiting_mailbox = null;
    }

    const { data, error } = await client
      .from("note_user_actions")
      .upsert(upsertData, { onConflict: "user_id,note_id" })
      .select("action_state, action_mode, is_in_actions, private_tags")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const row = data as { action_state: string; action_mode: string; is_in_actions: boolean; private_tags: string[] };
    return NextResponse.json({
      action_state: row.action_state,
      action_mode: row.action_mode,
      is_in_actions: row.is_in_actions,
      private_tags: row.private_tags,
    });
  }

  // Path B: Partial update — only updates the provided subset of fields
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (is_in_actions !== undefined) patch.is_in_actions = is_in_actions;
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
    .select("action_state, action_mode, is_in_actions, private_tags")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { action_state: string; action_mode: string; is_in_actions: boolean; private_tags: string[] };
  return NextResponse.json({
    action_state: row.action_state,
    action_mode: row.action_mode,
    is_in_actions: row.is_in_actions,
    private_tags: row.private_tags,
  });
}
