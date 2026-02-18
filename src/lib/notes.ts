import { supabase } from "./supabase";

export type NoteRow = {
  id: string;
  content: string;
  column_id: string;
  created_at: string;
};

export async function listNotes(): Promise<{ data: NoteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, content, column_id, created_at")
    .order("created_at", { ascending: false });

  return {
    data: (data ?? []) as NoteRow[],
    error: error?.message ?? null,
  };
}

export async function createNote(
  content: string,
  columnId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("notes").insert([{ content, column_id: columnId }]);
  return { error: error?.message ?? null };
}

export async function deleteNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function updateNote(id: string, content: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("notes").update({ content }).eq("id", id);
  return { error: error?.message ?? null };
}

export async function moveNote(id: string, columnId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("notes").update({ column_id: columnId }).eq("id", id);
  return { error: error?.message ?? null };
}

export async function moveColumnNotes(
  fromColumnId: string,
  toColumnId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("notes")
    .update({ column_id: toColumnId })
    .eq("column_id", fromColumnId);
  return { error: error?.message ?? null };
}
