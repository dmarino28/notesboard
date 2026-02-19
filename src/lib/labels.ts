import { supabase } from "./supabase";

export type LabelRow = {
  id: string;
  board_id: string;
  name: string;
  color: string;
  created_at: string;
};

export async function listLabels(
  boardId: string,
): Promise<{ data: LabelRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("labels")
    .select("id, board_id, name, color, created_at")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true });

  return { data: (data ?? []) as LabelRow[], error: error?.message ?? null };
}

export async function createLabel(
  boardId: string,
  name: string,
  color: string,
): Promise<{ data: LabelRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("labels")
    .insert([{ board_id: boardId, name, color }])
    .select()
    .single();

  return { data: data as LabelRow | null, error: error?.message ?? null };
}

export async function deleteLabel(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("labels").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function listNoteLabels(
  noteId: string,
): Promise<{ data: LabelRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("note_labels")
    .select("label_id, labels(id, board_id, name, color, created_at)")
    .eq("note_id", noteId);

  if (error) return { data: [], error: error.message };

  const labels = (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => row.labels)
    .filter(Boolean) as LabelRow[];

  return { data: labels, error: null };
}

export async function attachLabel(
  noteId: string,
  labelId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("note_labels")
    .insert([{ note_id: noteId, label_id: labelId }]);
  return { error: error?.message ?? null };
}

export async function detachLabel(
  noteId: string,
  labelId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("note_labels")
    .delete()
    .eq("note_id", noteId)
    .eq("label_id", labelId);
  return { error: error?.message ?? null };
}

/**
 * Returns a map of noteId → LabelRow[] for all notes on a board.
 * Two queries: fetch all board labels, then all note_labels referencing them.
 */
export async function listBoardNoteLabels(
  boardId: string,
): Promise<{ data: Record<string, LabelRow[]>; error: string | null }> {
  const { data: labels, error: le } = await supabase
    .from("labels")
    .select("id, board_id, name, color, created_at")
    .eq("board_id", boardId);

  if (le) return { data: {}, error: le.message };
  if (!labels || labels.length === 0) return { data: {}, error: null };

  const labelMap = Object.fromEntries(labels.map((l) => [l.id, l as LabelRow]));
  const labelIds = labels.map((l) => l.id);

  const { data: noteLabels, error: nle } = await supabase
    .from("note_labels")
    .select("note_id, label_id")
    .in("label_id", labelIds);

  if (nle) return { data: {}, error: nle.message };

  const map: Record<string, LabelRow[]> = {};
  for (const row of (noteLabels ?? []) as { note_id: string; label_id: string }[]) {
    const label = labelMap[row.label_id];
    if (label) {
      if (!map[row.note_id]) map[row.note_id] = [];
      map[row.note_id].push(label);
    }
  }

  return { data: map, error: null };
}
