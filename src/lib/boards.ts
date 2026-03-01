import { supabase } from "./supabase";

export type BoardRow = {
  id: string;
  name: string;
  position: number;
  created_at: string;
  // Snapshot header (Bucket 6A)
  show_snapshot_header: boolean;
  campaign_phase: string | null;
  release_date: string | null;
  premiere_date: string | null;
  trailer_debut_date: string | null;
  key_markets: string[];
  snapshot_notes: string | null;
};

export async function listBoards(): Promise<{ data: BoardRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("boards")
    .select("id, name, position, created_at, show_snapshot_header, campaign_phase, release_date, premiere_date, trailer_debut_date, key_markets, snapshot_notes")
    .order("position", { ascending: true });

  return {
    data: (data ?? []) as BoardRow[],
    error: error?.message ?? null,
  };
}

export async function createBoard(
  name: string,
): Promise<{ data: BoardRow | null; error: string | null }> {
  const { data: existing } = await supabase
    .from("boards")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("boards")
    .insert([{ name, position: nextPosition }])
    .select()
    .single();

  return {
    data: data as BoardRow | null,
    error: error?.message ?? null,
  };
}

export async function updateBoard(
  id: string,
  updates: Partial<Pick<BoardRow, "name" | "show_snapshot_header" | "campaign_phase" | "release_date" | "premiere_date" | "trailer_debut_date" | "key_markets" | "snapshot_notes">>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("boards").update(updates).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteBoard(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("boards").delete().eq("id", id);
  return { error: error?.message ?? null };
}
