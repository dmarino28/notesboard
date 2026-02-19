import { supabase } from "./supabase";

export type CommentRow = {
  id: string;
  note_id: string;
  content: string;
  created_at: string;
};

export async function listComments(
  noteId: string,
): Promise<{ data: CommentRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("comments")
    .select("id, note_id, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  return { data: (data ?? []) as CommentRow[], error: error?.message ?? null };
}

export async function addComment(
  noteId: string,
  content: string,
): Promise<{ data: CommentRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("comments")
    .insert([{ note_id: noteId, content }])
    .select()
    .single();

  return { data: data as CommentRow | null, error: error?.message ?? null };
}

export async function deleteComment(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  return { error: error?.message ?? null };
}
