import { supabase } from "./supabase";
import { ColumnRow } from "./columns";
import { NoteRow } from "./notes";
import { LabelRow, listLabels, attachLabel } from "./labels";
import { createPlacement } from "./placements";

/**
 * Move a column (and all its notes' placements) to a different board.
 * The column gets position = max_position_in_target + 1.
 * Source board positions are left with a gap (acceptable; they're still ordered).
 */
export async function moveColumnToBoard(
  columnId: string,
  targetBoardId: string,
  sourceBoardId: string,
): Promise<{ error: string | null }> {
  // Compute target position
  const { data: targetCols } = await supabase
    .from("columns")
    .select("position")
    .eq("board_id", targetBoardId)
    .order("position", { ascending: false })
    .limit(1);

  const targetPosition = targetCols && targetCols.length > 0 ? targetCols[0].position + 1 : 0;

  // Move column
  const { error: colErr } = await supabase
    .from("columns")
    .update({ board_id: targetBoardId, position: targetPosition })
    .eq("id", columnId);

  if (colErr) return { error: colErr.message };

  // Move notes (deprecated fields)
  const { error: notesErr } = await supabase
    .from("notes")
    .update({ board_id: targetBoardId })
    .eq("column_id", columnId);

  if (notesErr) return { error: notesErr.message };

  // Update placements to new board — only placements on the source board
  const { error: placementsErr } = await supabase
    .from("note_placements")
    .update({ board_id: targetBoardId })
    .eq("column_id", columnId)
    .eq("board_id", sourceBoardId);

  return { error: placementsErr?.message ?? null };
}

/**
 * Copy a column (and all its notes) to a different board.
 * Label matching: only labels that exist in the target board with same name+color are attached;
 * others are silently skipped.
 * Returns the new column and notes so the caller can update local state if the target is the current board.
 */
export async function copyColumnToBoard(
  column: ColumnRow,
  notes: NoteRow[],
  targetBoardId: string,
  noteLabelMap: Record<string, LabelRow[]>,
): Promise<{ data: { column: ColumnRow; notes: NoteRow[] } | null; error: string | null }> {
  // Compute target position
  const { data: targetCols } = await supabase
    .from("columns")
    .select("position")
    .eq("board_id", targetBoardId)
    .order("position", { ascending: false })
    .limit(1);

  const targetPosition = targetCols && targetCols.length > 0 ? targetCols[0].position + 1 : 0;

  // Create new column
  const { data: newCol, error: colErr } = await supabase
    .from("columns")
    .insert([{ name: column.name, color: column.color, position: targetPosition, board_id: targetBoardId }])
    .select()
    .single();

  if (colErr || !newCol) {
    return { data: null, error: colErr?.message ?? "Failed to create column" };
  }

  // Fetch target board labels for name+color matching
  const { data: targetLabels } = await listLabels(targetBoardId);

  // Copy notes preserving relative order
  const sortedNotes = [...notes].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const newNotes: NoteRow[] = [];

  for (let i = 0; i < sortedNotes.length; i++) {
    const note = sortedNotes[i];

    const { data: newNote, error: noteErr } = await supabase
      .from("notes")
      .insert([
        {
          content: note.content,
          description: note.description,
          due_date: note.due_date,
          event_start: note.event_start,
          event_end: note.event_end,
          archived: false,
          column_id: newCol.id,
          board_id: targetBoardId,
          position: i,
        },
      ])
      .select()
      .single();

    if (noteErr || !newNote) continue;
    newNotes.push(newNote as NoteRow);

    // Create placement for the new note
    await createPlacement({
      noteId: (newNote as NoteRow).id,
      boardId: targetBoardId,
      columnId: newCol.id,
      position: i,
    });

    // Attach matching labels
    const sourceLabels = noteLabelMap[note.id] ?? [];
    for (const src of sourceLabels) {
      const match = targetLabels.find((l) => l.name === src.name && l.color === src.color);
      if (match) await attachLabel((newNote as NoteRow).id, match.id);
    }
  }

  return { data: { column: newCol as ColumnRow, notes: newNotes }, error: null };
}
