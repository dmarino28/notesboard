import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import type { NoteActionMap } from "@/lib/userActions";

export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { client } = auth;

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0) return NextResponse.json({} satisfies NoteActionMap);

  const { data, error } = await client
    .from("note_user_actions")
    .select("note_id, action_state, personal_due_date")
    .in("note_id", ids);

  if (error || !data) return NextResponse.json({} satisfies NoteActionMap);

  const map: NoteActionMap = {};
  for (const row of data as { note_id: string; action_state: string; personal_due_date: string | null }[]) {
    map[row.note_id] = {
      action_state: row.action_state as NoteActionMap[string]["action_state"],
      personal_due_date: row.personal_due_date,
    };
  }

  return NextResponse.json(map);
}
