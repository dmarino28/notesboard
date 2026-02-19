import { supabase } from "./supabase";

export type ColumnRow = {
  id: string;
  name: string;
  position: number;
  color: string | null;
  created_at: string;
  board_id: string;
};

export async function listColumns(
  boardId: string,
): Promise<{ data: ColumnRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("columns")
    .select("id, name, position, color, created_at, board_id")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  return {
    data: (data ?? []) as ColumnRow[],
    error: error?.message ?? null,
  };
}

export async function createColumn(
  boardId: string,
  name: string,
): Promise<{ data: ColumnRow | null; error: string | null }> {
  const { data: existing } = await supabase
    .from("columns")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("columns")
    .insert([{ name, position: nextPosition, board_id: boardId }])
    .select()
    .single();

  return {
    data: data as ColumnRow | null,
    error: error?.message ?? null,
  };
}

export async function updateColumn(
  id: string,
  updates: { name?: string; color?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("columns").update(updates).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteColumn(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("columns").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function reorderColumns(orderedIds: string[]): Promise<{ error: string | null }> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("columns").update({ position: index }).eq("id", id),
    ),
  );
  const errResult = results.find((r) => r.error);
  return { error: errResult?.error?.message ?? null };
}

// Persist only columns whose position actually changed (targeted update).
export async function reorderColumnPositions(
  updates: { id: string; position: number }[],
): Promise<{ error: string | null }> {
  if (updates.length === 0) return { error: null };
  const results = await Promise.all(
    updates.map(({ id, position }) =>
      supabase.from("columns").update({ position }).eq("id", id),
    ),
  );
  const errResult = results.find((r) => r.error);
  return { error: errResult?.error?.message ?? null };
}
