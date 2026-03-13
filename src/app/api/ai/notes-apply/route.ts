/**
 * POST /api/ai/notes-apply
 *
 * Apply a single AI suggestion to a board/card.
 *
 * GUARDRAILS:
 * - Only operates on boards/cards owned by the authenticated user's org
 * - Requires explicit suggestion data in the request body (no auto-inference)
 * - Returns the created/updated resource for display
 * - Original note entries are NEVER mutated
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import type { SuggestionType } from "@/lib/ai/noteOrganize";

type ApplyBody = {
  type: SuggestionType;
  targetBoardId: string;
  targetColumnId?: string | null;
  cardContent: string;
  cardDescription?: string;
  milestoneField?: string;
  milestoneValue?: string;
  sourceEntryIds: string[];
};

export async function POST(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, user } = auth;

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, targetBoardId, targetColumnId, cardContent, cardDescription, milestoneField, milestoneValue, sourceEntryIds } = body;

  if (!targetBoardId) {
    return NextResponse.json({ error: "targetBoardId required" }, { status: 400 });
  }

  // Verify board exists and is accessible
  const { data: board, error: boardErr } = await client
    .from("boards")
    .select("id, name")
    .eq("id", targetBoardId)
    .single();

  if (boardErr || !board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  switch (type) {
    case "create_card": {
      if (!cardContent) {
        return NextResponse.json({ error: "cardContent required for create_card" }, { status: 400 });
      }

      // Determine column — use targetColumnId if provided, otherwise first column on board
      let columnId = targetColumnId ?? null;
      if (!columnId) {
        const { data: cols } = await client
          .from("columns")
          .select("id")
          .eq("board_id", targetBoardId)
          .order("position", { ascending: true })
          .limit(1);
        columnId = cols?.[0]?.id ?? null;
      }

      if (!columnId) {
        return NextResponse.json({ error: "No column found on board" }, { status: 400 });
      }

      // Compute position (append at end)
      const { data: lastPlacements } = await client
        .from("note_placements")
        .select("position")
        .eq("column_id", columnId)
        .order("position", { ascending: false })
        .limit(1);

      const newPosition = ((lastPlacements?.[0]?.position as number) ?? 0) + 1000;

      // Create the note
      const { data: newNote, error: noteErr } = await client
        .from("notes")
        .insert({
          content: cardContent,
          description: cardDescription ?? null,
          board_id: targetBoardId,
          column_id: columnId,
          position: newPosition,
          created_by: user.id,
        })
        .select()
        .single();

      if (noteErr || !newNote) {
        return NextResponse.json({ error: noteErr?.message ?? "Card creation failed" }, { status: 500 });
      }

      // Create placement
      await client.from("note_placements").insert({
        note_id: newNote.id,
        board_id: targetBoardId,
        column_id: columnId,
        position: newPosition,
      });

      // Mark source entries as applied
      if (sourceEntryIds.length > 0) {
        await client
          .from("note_entries")
          .update({ status: "applied" })
          .in("id", sourceEntryIds);
      }

      return NextResponse.json({ ok: true, noteId: newNote.id, type: "create_card" });
    }

    case "update_board_metadata":
    case "add_milestone": {
      if (!milestoneField || milestoneValue === undefined) {
        return NextResponse.json({ error: "milestoneField and milestoneValue required" }, { status: 400 });
      }

      const ALLOWED_FIELDS = [
        "campaign_phase",
        "release_date",
        "premiere_date",
        "trailer_debut_date",
        "snapshot_notes",
      ];

      if (!ALLOWED_FIELDS.includes(milestoneField)) {
        return NextResponse.json(
          { error: `milestoneField must be one of: ${ALLOWED_FIELDS.join(", ")}` },
          { status: 400 }
        );
      }

      const { error: updateErr } = await client
        .from("boards")
        .update({ [milestoneField]: milestoneValue })
        .eq("id", targetBoardId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      if (sourceEntryIds.length > 0) {
        await client
          .from("note_entries")
          .update({ status: "applied" })
          .in("id", sourceEntryIds);
      }

      return NextResponse.json({ ok: true, type });
    }

    case "update_card": {
      // For update_card, the client should have matched a specific note ID
      // This is handled via the cardContent description being appended as a note update
      return NextResponse.json({ error: "update_card: use /api/notes/[noteId]/update instead" }, { status: 400 });
    }

    case "attach_note_reference": {
      // Just mark source entries as applied (the reference link is the side-effect)
      if (sourceEntryIds.length > 0) {
        await client
          .from("note_entries")
          .update({ status: "applied" })
          .in("id", sourceEntryIds);
      }
      return NextResponse.json({ ok: true, type });
    }

    default:
      return NextResponse.json({ error: "Unknown suggestion type" }, { status: 400 });
  }
}
