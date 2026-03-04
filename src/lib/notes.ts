import { supabase } from "./supabase";
import { getMyProfile } from "./profile";

export type NoteRow = {
  id: string;
  content: string;
  column_id: string;
  board_id: string;
  position: number;
  created_at: string;
  description: string | null;
  due_date: string | null;
  event_start: string | null;
  event_end: string | null;
  archived: boolean;
  status: string | null;
  last_public_activity_at: string | null;
  last_public_activity_user_id: string | null;
  last_public_activity_type: string | null;
  last_public_activity_preview: string | null;
  /** Set on any INSERT or UPDATE via DB trigger. Null for rows predating migration 000007. */
  updated_at?: string | null;
  highlight_on_snapshot: boolean;
  visibility: string | null;
  region: string | null;
  created_by: string | null;
};

export type ReorderUpdate = { id: string; column_id: string; position: number };

export type NoteFieldUpdates = Partial<
  Pick<NoteRow, "content" | "description" | "due_date" | "event_start" | "event_end" | "archived" | "status" | "highlight_on_snapshot" | "visibility">
>;

const NOTE_SELECT =
  "id, content, column_id, board_id, position, created_at, description, due_date, event_start, event_end, archived, status, last_public_activity_at, last_public_activity_user_id, last_public_activity_type, last_public_activity_preview, updated_at, highlight_on_snapshot, visibility, region, created_by";

export async function listNotes(
  boardId: string,
  showArchived = false,
): Promise<{ data: NoteRow[]; error: string | null }> {
  let query = supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("board_id", boardId)
    .order("column_id", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (!showArchived) {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;

  return {
    data: (data ?? []) as NoteRow[],
    error: error?.message ?? null,
  };
}

export async function createNote(
  content: string,
  columnId: string,
  position: number,
  boardId: string,
): Promise<{ data: NoteRow | null; error: string | null }> {
  const profile = await getMyProfile();
  const region =
    profile?.primary_region ??
    (profile?.regions?.length ? profile.regions[0] : null) ??
    "global";

  const { data, error } = await supabase
    .from("notes")
    .insert([{ content, column_id: columnId, position, board_id: boardId,
               visibility: "personal", region }])
    // created_by is omitted — DB DEFAULT auth.uid() sets it automatically
    .select(NOTE_SELECT)
    .single();
  return { data: (data as NoteRow | null) ?? null, error: error?.message ?? null };
}

export async function deleteNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function getNote(id: string): Promise<{ data: NoteRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("id", id)
    .maybeSingle();
  return { data: (data as NoteRow | null) ?? null, error: error?.message ?? null };
}

export async function updateNote(id: string, content: string): Promise<{ error: string | null }> {
  // .select("id") is required: without it a blocked RLS UPDATE returns
  // { data: null, error: null } — a silent no-op that looks like success.
  const { data, error } = await supabase
    .from("notes")
    .update({ content })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Save failed — no rows updated. Check RLS policy." };
  return { error: null };
}

export async function updateNoteFields(
  id: string,
  fields: NoteFieldUpdates,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("notes").update(fields).eq("id", id);
  return { error: error?.message ?? null };
}

export async function reorderNotes(updates: ReorderUpdate[]): Promise<{ error: string | null }> {
  if (updates.length === 0) return { error: null };

  const results = await Promise.allSettled(
    updates.map(async (u) => {
      // .select("id") makes Supabase return the updated row(s).
      // Without it, a blocked RLS UPDATE returns { data: null, error: null } — silent failure.
      const { data, error } = await supabase
        .from("notes")
        .update({ column_id: u.column_id, position: u.position })
        .eq("id", u.id)
        .select("id");

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error(`No rows updated for note ${u.id} — check RLS UPDATE policy on notes`);
      }
    }),
  );

  const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

  if (failures.length > 0) {
    console.error("reorderNotes failures:", failures.map((f) => f.reason));
    return { error: failures[0].reason?.message ?? "Reorder failed" };
  }

  return { error: null };
}
