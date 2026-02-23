import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";

type RequestBody = {
  note_id: string;
  // in_my_actions: false is an explicit "remove from My Actions" (deletes the row).
  in_my_actions?: boolean;
  action_state?: string;
  personal_due_date?: string | null;
  private_tags?: string[];
};

type RowShape = {
  action_state: string;
  personal_due_date: string | null;
  private_tags: string[];
};

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

  const { note_id, in_my_actions, action_state, personal_due_date, private_tags } = body;
  if (!note_id) {
    return NextResponse.json({ error: "note_id required" }, { status: 400 });
  }

  // Explicit remove: in_my_actions: false OR action_state: "none"
  // (back-compat: old callers may still send action_state: "none")
  const shouldRemove = in_my_actions === false || action_state === "none";
  if (shouldRemove) {
    const { error } = await client
      .from("note_user_actions")
      .delete()
      .eq("user_id", user.id)
      .eq("note_id", note_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ deleted: true });
  }

  // Path A: action_state provided → upsert (create or update full row)
  if (action_state !== undefined) {
    const validStates = ["needs_action", "waiting", "done"];
    if (!validStates.includes(action_state)) {
      return NextResponse.json({ error: "Invalid action_state" }, { status: 400 });
    }

    const { data, error } = await client
      .from("note_user_actions")
      .upsert(
        {
          user_id: user.id,
          note_id,
          action_state,
          personal_due_date: personal_due_date ?? null,
          ...(private_tags !== undefined ? { private_tags } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,note_id" },
      )
      .select("action_state, personal_due_date, private_tags")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = data as RowShape;
    return NextResponse.json({
      action_state: row.action_state,
      personal_due_date: row.personal_due_date,
      private_tags: row.private_tags,
    });
  }

  // Path B: Partial update — only personal_due_date and/or private_tags
  // Must NOT delete the row just because action_state was not provided.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (personal_due_date !== undefined) patch.personal_due_date = personal_due_date;
  if (private_tags !== undefined) patch.private_tags = private_tags;

  if (Object.keys(patch).length === 1) {
    // Nothing meaningful to update (only updated_at)
    return NextResponse.json({ noop: true });
  }

  const { data, error } = await client
    .from("note_user_actions")
    .update(patch)
    .eq("user_id", user.id)
    .eq("note_id", note_id)
    .select("action_state, personal_due_date, private_tags")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as RowShape;
  return NextResponse.json({
    action_state: row.action_state,
    personal_due_date: row.personal_due_date,
    private_tags: row.private_tags,
  });
}
