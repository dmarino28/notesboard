import { supabase } from "./supabase";

export type PlacedNoteRow = {
  id: string;              // placement_id — used as dnd-kit sortable id
  note_id: string;         // canonical note id
  board_id: string;        // from placement
  column_id: string;       // from placement
  position: number;        // from placement
  created_at: string;      // note's created_at — sort tiebreaker
  content: string;
  description: string | null;
  due_date: string | null;
  event_start: string | null;
  event_end: string | null;
  archived: boolean;
  placement_count: number; // total note_placements rows for this note_id
  status: string | null;
  last_public_activity_at: string | null;
  last_public_activity_user_id: string | null;
  last_public_activity_type: string | null;
  last_public_activity_preview: string | null;
  /** Set on any INSERT or UPDATE via DB trigger. Null for rows predating migration 000007. */
  updated_at: string | null;
  highlight_on_snapshot: boolean;
};

export type PlacementReorderUpdate = { id: string; column_id: string; position: number };

export async function listPlacements(
  boardId: string,
  showArchived = false,
): Promise<{ data: PlacedNoteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("note_placements")
    .select(
      "id, note_id, board_id, column_id, position, notes(id, content, description, due_date, event_start, event_end, archived, created_at, status, last_public_activity_at, last_public_activity_user_id, last_public_activity_type, last_public_activity_preview, updated_at, highlight_on_snapshot)",
    )
    .eq("board_id", boardId)
    .order("column_id", { ascending: true })
    .order("position", { ascending: true });

  if (error) return { data: [], error: error.message };

  type RawNote = {
    id: string;
    content: string;
    description: string | null;
    due_date: string | null;
    event_start: string | null;
    event_end: string | null;
    archived: boolean;
    created_at: string;
    status: string | null;
    last_public_activity_at: string | null;
    last_public_activity_user_id: string | null;
    last_public_activity_type: string | null;
    last_public_activity_preview: string | null;
    updated_at: string | null;
    highlight_on_snapshot: boolean;
  };
  type RawRow = {
    id: string;
    note_id: string;
    board_id: string;
    column_id: string;
    position: number;
    // Supabase returns related rows as array in PostgREST
    notes: RawNote | RawNote[] | null;
  };
  const rawRows = (data as unknown as RawRow[]) ?? [];

  // Normalize: Supabase may return notes as array (to-one via FK) or object
  function resolveNote(n: RawNote | RawNote[] | null): RawNote | null {
    if (!n) return null;
    if (Array.isArray(n)) return n[0] ?? null;
    return n;
  }

  // Filter archived client-side (simpler than chaining .eq on the join)
  const filtered = rawRows.filter((p) => {
    const note = resolveNote(p.notes);
    return note && (showArchived || !note.archived);
  });

  if (filtered.length === 0) return { data: [], error: null };

  // Fetch placement counts for all note_ids in one query
  const noteIds = [...new Set(filtered.map((p) => p.note_id))];
  const { data: allPlacements } = await supabase
    .from("note_placements")
    .select("note_id")
    .in("note_id", noteIds);

  const countMap: Record<string, number> = {};
  for (const row of (allPlacements ?? []) as { note_id: string }[]) {
    countMap[row.note_id] = (countMap[row.note_id] ?? 0) + 1;
  }

  const rows: PlacedNoteRow[] = filtered.map((p) => {
    const note = resolveNote(p.notes)!;
    return {
      id: p.id,
      note_id: p.note_id,
      board_id: p.board_id,
      column_id: p.column_id,
      position: p.position,
      created_at: note.created_at,
      content: note.content,
      description: note.description,
      due_date: note.due_date,
      event_start: note.event_start,
      event_end: note.event_end,
      archived: note.archived,
      placement_count: countMap[p.note_id] ?? 1,
      status: note.status,
      last_public_activity_at: note.last_public_activity_at,
      last_public_activity_user_id: note.last_public_activity_user_id,
      last_public_activity_type: note.last_public_activity_type,
      last_public_activity_preview: note.last_public_activity_preview,
      updated_at: note.updated_at,
      highlight_on_snapshot: note.highlight_on_snapshot,
    };
  });

  return { data: rows, error: null };
}

export async function createPlacement(params: {
  noteId: string;
  boardId: string;
  columnId: string;
  position: number;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("note_placements").insert([
    {
      note_id: params.noteId,
      board_id: params.boardId,
      column_id: params.columnId,
      position: params.position,
    },
  ]);
  return { error: error?.message ?? null };
}

export async function deletePlacement(placementId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("note_placements").delete().eq("id", placementId);
  return { error: error?.message ?? null };
}

export async function reorderPlacements(
  updates: PlacementReorderUpdate[],
): Promise<{ error: string | null }> {
  if (updates.length === 0) return { error: null };

  const results = await Promise.allSettled(
    updates.map(async (u) => {
      const { data, error } = await supabase
        .from("note_placements")
        .update({ column_id: u.column_id, position: u.position })
        .eq("id", u.id)
        .select("id");

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error(`No rows updated for placement ${u.id} — check RLS UPDATE policy`);
      }
    }),
  );

  const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failures.length > 0) {
    console.error("reorderPlacements failures:", failures.map((f) => f.reason));
    return { error: failures[0].reason?.message ?? "Reorder failed" };
  }

  return { error: null };
}

// ─── Note placement helpers for the Outlook add-in ──────────────────────────

export type NotePlacementInfo = {
  placementId: string;
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
};

/**
 * Returns all boards/columns a note lives on, with resolved names.
 * Used by CardDetailPane to display placement info and populate the move dropdown.
 */
export async function getNotePlacements(noteId: string): Promise<NotePlacementInfo[]> {
  const { data: rawPlacements } = await supabase
    .from("note_placements")
    .select("id, board_id, column_id")
    .eq("note_id", noteId);

  if (!rawPlacements || rawPlacements.length === 0) return [];

  const pRows = rawPlacements as { id: string; board_id: string; column_id: string }[];
  const boardIds = [...new Set(pRows.map((p) => p.board_id))];
  const columnIds = [...new Set(pRows.map((p) => p.column_id))];

  const [boardsResult, columnsResult] = await Promise.all([
    supabase.from("boards").select("id, name").in("id", boardIds),
    supabase.from("columns").select("id, name").in("id", columnIds),
  ]);

  const boardMap = new Map(
    ((boardsResult.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]),
  );
  const colMap = new Map(
    ((columnsResult.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  return pRows.map((p) => ({
    placementId: p.id,
    boardId: p.board_id,
    boardName: boardMap.get(p.board_id) ?? "Unknown",
    columnId: p.column_id,
    columnName: colMap.get(p.column_id) ?? "Unknown",
  }));
}

/**
 * Moves a placement to a new column (appended at the end of the target column).
 */
export async function movePlacement(
  placementId: string,
  boardId: string,
  newColumnId: string,
): Promise<{ error: string | null }> {
  const position = (await maxPlacementPosition(boardId, newColumnId)) + 1;
  return reorderPlacements([{ id: placementId, column_id: newColumnId, position }]);
}

/** Max position of existing placements in a given column on a given board. Returns -1 if none. */
export async function maxPlacementPosition(
  boardId: string,
  columnId: string,
): Promise<number> {
  const { data } = await supabase
    .from("note_placements")
    .select("position")
    .eq("board_id", boardId)
    .eq("column_id", columnId)
    .order("position", { ascending: false })
    .limit(1);

  return data && data.length > 0 ? (data[0] as { position: number }).position : -1;
}
