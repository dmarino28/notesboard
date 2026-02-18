import { supabase } from "./supabase";

export type ColumnRow = {
  id: string;
  name: string;
  position: number;
  created_at: string;
};

export async function listColumns(): Promise<{ data: ColumnRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("columns")
    .select("id, name, position, created_at")
    .order("position", { ascending: true });

  return {
    data: (data ?? []) as ColumnRow[],
    error: error?.message ?? null,
  };
}

export async function createColumn(
  name: string,
): Promise<{ data: ColumnRow | null; error: string | null }> {
  const { data: existing } = await supabase
    .from("columns")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("columns")
    .insert([{ name, position: nextPosition }])
    .select()
    .single();

  return {
    data: data as ColumnRow | null,
    error: error?.message ?? null,
  };
}

export async function updateColumn(id: string, name: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("columns").update({ name }).eq("id", id);
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
