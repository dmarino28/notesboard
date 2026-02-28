import { supabase } from "./supabase";

export type AwarenessMap = Record<string, { last_viewed_at: string | null }>;

/**
 * Fetches per-user last_viewed_at for a set of note IDs in a single query.
 * Returns an empty map if unauthenticated or if no rows exist.
 */
export async function listAwarenessForNotes(noteIds: string[]): Promise<AwarenessMap> {
  if (noteIds.length === 0) return {};

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("note_user_awareness")
    .select("note_id, last_viewed_at")
    .in("note_id", noteIds);

  const map: AwarenessMap = {};
  for (const row of (data ?? []) as { note_id: string; last_viewed_at: string | null }[]) {
    map[row.note_id] = { last_viewed_at: row.last_viewed_at };
  }
  return map;
}

/**
 * Upserts last_viewed_at = now() for the given note.
 * No-op if unauthenticated.
 */
export async function markNoteViewed(noteId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("note_user_awareness")
    .upsert(
      { user_id: user.id, note_id: noteId, last_viewed_at: new Date().toISOString() },
      { onConflict: "user_id,note_id" },
    );
}
