import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { detectSignals } from "@/lib/noteSignals";
import type { Signal } from "@/lib/noteSignals";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/note-entries/[id] — update content, position, indent, context
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client } = auth;

  let body: {
    content?: string;
    position?: number;
    indent_level?: number;
    explicit_board_id?: string | null;
    inferred_board_id?: string | null;
    context_source?: string;
    status?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {};
  if (body.content !== undefined) updatePayload.content = body.content;
  if (body.position !== undefined) updatePayload.position = body.position;
  if (body.indent_level !== undefined) updatePayload.indent_level = body.indent_level;
  if (body.explicit_board_id !== undefined) updatePayload.explicit_board_id = body.explicit_board_id;
  if (body.inferred_board_id !== undefined) updatePayload.inferred_board_id = body.inferred_board_id;
  if (body.context_source !== undefined) updatePayload.context_source = body.context_source;
  if (body.status !== undefined) updatePayload.status = body.status;

  // If content changed, re-detect signals server-side
  let newSignals: Signal[] | null = null;
  if (body.content !== undefined) {
    const { data: boards } = await client.from("boards").select("id, name");
    newSignals = detectSignals(body.content, boards ?? []);

    // Update context from fresh signals
    const boardSig = newSignals.find((s) => s.type === "board");
    if (boardSig) {
      updatePayload.explicit_board_id = boardSig.value;
      updatePayload.inferred_board_id = null;
      updatePayload.context_source = "direct_match";
    } else if (!body.explicit_board_id && !body.inferred_board_id) {
      // Only clear if not explicitly provided
      updatePayload.explicit_board_id = null;
      updatePayload.context_source = "unknown";
    }
  }

  const { data: entry, error } = await client
    .from("note_entries")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error || !entry) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  // Re-upsert signals if content changed
  if (newSignals !== null) {
    await client.from("note_entry_signals").delete().eq("entry_id", id);
    if (newSignals.length > 0) {
      await client.from("note_entry_signals").insert(
        newSignals.map((s) => ({
          entry_id: id,
          signal_type: s.type,
          signal_value: s.value,
          normalized_value: s.normalizedValue ?? null,
          match_text: s.matchText,
          match_start: s.matchStart,
          match_end: s.matchEnd,
        }))
      );
    }
  }

  return NextResponse.json({ entry });
}

// DELETE /api/note-entries/[id] — soft-delete (set status = archived)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client } = auth;

  const { error } = await client
    .from("note_entries")
    .update({ status: "archived" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
