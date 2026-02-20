import { supabase } from "./supabase";
import { listEmailThreadNoteIds } from "./emailThreads";

/**
 * Full-text search over note content using ilike.
 * Returns id + content for the top 10 non-archived matches, newest first.
 */
export async function searchNotes(query: string): Promise<{ id: string; content: string }[]> {
  const { data } = await supabase
    .from("notes")
    .select("id, content")
    .ilike("content", `%${query}%`)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as { id: string; content: string }[];
}

export type BrowsableCard = {
  noteId: string;
  content: string;
  boardId: string;
  placementCount: number; // >1 means the note lives on multiple boards
  hasEmailThread: boolean;
};

/**
 * Returns the most recent non-archived cards with placement and email-thread metadata.
 * Used as the default browse list in the Link tab of the Outlook add-in.
 * Notes with no placements (orphans) are excluded.
 */
export async function listBrowsableCards(limit = 30): Promise<BrowsableCard[]> {
  const { data: notes } = await supabase
    .from("notes")
    .select("id, content")
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!notes || notes.length === 0) return [];

  const noteIds = (notes as { id: string; content: string }[]).map((n) => n.id);

  const [{ data: placements }, emailNoteIds] = await Promise.all([
    supabase.from("note_placements").select("note_id, board_id").in("note_id", noteIds),
    listEmailThreadNoteIds(noteIds),
  ]);

  const placementsByNote = new Map<string, string[]>(); // noteId → board_ids
  for (const p of (placements ?? []) as { note_id: string; board_id: string }[]) {
    const arr = placementsByNote.get(p.note_id) ?? [];
    arr.push(p.board_id);
    placementsByNote.set(p.note_id, arr);
  }

  const result: BrowsableCard[] = [];
  for (const n of notes as { id: string; content: string }[]) {
    const boards = placementsByNote.get(n.id) ?? [];
    if (boards.length === 0) continue; // skip orphan notes
    result.push({
      noteId: n.id,
      content: n.content,
      boardId: boards[0],
      placementCount: boards.length,
      hasEmailThread: emailNoteIds.has(n.id),
    });
  }

  return result;
}
