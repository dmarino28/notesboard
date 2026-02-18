import { supabase } from "./supabase";

export type NoteRow = {
  id: string;
  content: string;
  created_at: string;
};

export async function listNotes(): Promise<{ data: NoteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, content, created_at")
    .order("created_at", { ascending: false });

  return {
    data: (data ?? []) as NoteRow[],
    error: error?.message ?? null,
  };
}

export async function createNote(content: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("notes").insert([{ content }]);
  return { error: error?.message ?? null };
}
