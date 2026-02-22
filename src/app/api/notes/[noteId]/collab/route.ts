import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;

  const [updatesResult, activityResult] = await Promise.all([
    supabase
      .from("note_updates")
      .select("id, note_id, user_id, content, status_change, due_date_change, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true }),
    supabase
      .from("note_activity")
      .select("id, note_id, activity_type, payload, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true }),
  ]);

  return Response.json({
    updates: updatesResult.data ?? [],
    activity: activityResult.data ?? [],
  });
}
