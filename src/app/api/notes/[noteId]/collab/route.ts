import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { client, user } = auth;

  const { noteId } = await params;

  const [updatesResult, activityResult] = await Promise.all([
    client
      .from("note_updates")
      .select("id, note_id, user_id, content, status_change, due_date_change, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false }),
    client
      .from("note_activity")
      .select("id, note_id, actor_user_id, activity_type, payload, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    updates: updatesResult.data ?? [],
    activity: activityResult.data ?? [],
    currentUserId: user.id,
  });
}
