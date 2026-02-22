import { NextRequest, NextResponse } from "next/server";
import { createUserClient, extractBearerToken } from "@/lib/supabaseServer";

type RequestBody = {
  note_id: string;
  action_state: string;
  personal_due_date?: string | null;
};

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createUserClient(token);
  const { data: { user }, error: authErr } = await client.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { note_id, action_state, personal_due_date } = body;
  if (!note_id) {
    return NextResponse.json({ error: "note_id required" }, { status: 400 });
  }

  // "none" means delete the row (presence of row = has an action state)
  if (!action_state || action_state === "none") {
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

  const { data, error } = await client
    .from("note_user_actions")
    .upsert(
      {
        user_id: user.id,
        note_id,
        action_state,
        personal_due_date: personal_due_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,note_id" },
    )
    .select("action_state, personal_due_date")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    action_state: (data as { action_state: string; personal_due_date: string | null }).action_state,
    personal_due_date: (data as { action_state: string; personal_due_date: string | null }).personal_due_date,
  });
}
