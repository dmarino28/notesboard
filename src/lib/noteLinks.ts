import { supabase } from "./supabase";

export type NoteLinkRow = {
  id: string;
  note_id: string;
  url: string;
  title: string | null;
  created_by: string;
  created_at: string;
};

const NOTE_LINK_SELECT = "id, note_id, url, title, created_by, created_at";

export async function listNoteLinks(
  noteId: string,
): Promise<{ data: NoteLinkRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("note_links")
    .select(NOTE_LINK_SELECT)
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  return { data: (data ?? []) as NoteLinkRow[], error: error?.message ?? null };
}

export async function addNoteLink(
  noteId: string,
  url: string,
  title: string | null,
): Promise<{ data: NoteLinkRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("note_links")
    .insert({ note_id: noteId, url, title })
    .select(NOTE_LINK_SELECT)
    .single();
  return { data: (data as NoteLinkRow | null) ?? null, error: error?.message ?? null };
}

export async function deleteNoteLink(
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("note_links").delete().eq("id", id);
  return { error: error?.message ?? null };
}
