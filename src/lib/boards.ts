import { supabase } from "./supabase";

export type BoardRow = {
  id: string;
  name: string;
  position: number;
  created_at: string;
};

export async function listBoards(): Promise<{ data: BoardRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("boards")
    .select("id, name, position, created_at")
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
  updates: { name?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("boards").update(updates).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteBoard(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("boards").delete().eq("id", id);
  return { error: error?.message ?? null };
}
