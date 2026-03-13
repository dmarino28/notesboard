import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { detectSignals } from "@/lib/noteSignals";
import { inferContextForEntries } from "@/lib/noteContext";
import type { Signal } from "@/lib/noteSignals";

// GET /api/note-entries — list all active entries for the authenticated user
export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client } = auth;

  const { data: entries, error: entriesErr } = await client
    .from("note_entries")
    .select("*")
    .eq("status", "active")
    .order("entry_date", { ascending: false })
    .order("position", { ascending: true });

  if (entriesErr) {
    return NextResponse.json({ error: entriesErr.message }, { status: 500 });
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ entries: [] });
  }

  const entryIds = entries.map((e) => e.id as string);

  const { data: signals } = await client
    .from("note_entry_signals")
    .select("*")
    .in("entry_id", entryIds);

  const signalsByEntry = new Map<string, object[]>();
  for (const sig of signals ?? []) {
    const list = signalsByEntry.get(sig.entry_id as string) ?? [];
    list.push(sig);
    signalsByEntry.set(sig.entry_id as string, list);
  }

  const result = entries.map((e) => ({
    ...e,
    signals: signalsByEntry.get(e.id as string) ?? [],
  }));

  return NextResponse.json({ entries: result });
}

// POST /api/note-entries — create a new entry (and detect signals server-side)
export async function POST(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, user } = auth;

  let body: {
    content: string;
    position?: number;
    indent_level?: number;
    parent_entry_id?: string | null;
    explicit_board_id?: string | null;
    inferred_board_id?: string | null;
    context_source?: string;
    entry_date?: string;
    meeting_timestamp?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Fetch board names for server-side signal detection
  const { data: boards } = await client.from("boards").select("id, name");

  const signals: Signal[] = detectSignals(body.content ?? "", boards ?? []);

  // Determine context from signals
  let contextSource = body.context_source ?? "unknown";
  let explicitBoardId = body.explicit_board_id ?? null;
  let inferredBoardId = body.inferred_board_id ?? null;

  const boardSig = signals.find((s) => s.type === "board");
  if (boardSig) {
    explicitBoardId = boardSig.value;
    inferredBoardId = null;
    contextSource = "direct_match";
  }

  const { data: entry, error: insertErr } = await client
    .from("note_entries")
    .insert({
      user_id: user.id,
      content: body.content ?? "",
      position: body.position ?? Date.now(),
      indent_level: body.indent_level ?? 0,
      parent_entry_id: body.parent_entry_id ?? null,
      explicit_board_id: explicitBoardId,
      inferred_board_id: inferredBoardId,
      context_source: contextSource,
      entry_date: body.entry_date ?? today,
      meeting_timestamp: body.meeting_timestamp ?? null,
    })
    .select()
    .single();

  if (insertErr || !entry) {
    return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Upsert signals
  if (signals.length > 0) {
    await client.from("note_entry_signals").insert(
      signals.map((s) => ({
        entry_id: entry.id,
        signal_type: s.type,
        signal_value: s.value,
        normalized_value: s.normalizedValue ?? null,
        match_text: s.matchText,
        match_start: s.matchStart,
        match_end: s.matchEnd,
      }))
    );
  }

  return NextResponse.json({ entry: { ...entry, signals } }, { status: 201 });
}
