import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { callAI } from "@/lib/ai/provider";
import {
  buildNotesOrganizeSystem,
  buildNotesOrganizeUser,
  normalizeNotesOrganize,
} from "@/lib/ai/noteOrganize";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { ColumnRow } from "@/lib/columns";

export async function POST(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client } = auth;

  let body: { entry_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entry_ids } = body;

  // Load entries
  let entries: NoteEntryWithSignals[];

  if (entry_ids && entry_ids.length > 0) {
    const { data: rawEntries } = await client
      .from("note_entries")
      .select("*")
      .in("id", entry_ids)
      .order("entry_date", { ascending: false })
      .order("position", { ascending: true });

    if (!rawEntries) return NextResponse.json({ suggestions: [] });

    const ids = rawEntries.map((e) => e.id as string);
    const { data: signals } = await client
      .from("note_entry_signals")
      .select("*")
      .in("entry_id", ids);

    const sigMap = new Map<string, object[]>();
    for (const s of signals ?? []) {
      const list = sigMap.get(s.entry_id as string) ?? [];
      list.push(s);
      sigMap.set(s.entry_id as string, list);
    }

    entries = rawEntries.map((e) => ({
      ...(e as NoteEntryWithSignals),
      signals: (sigMap.get(e.id as string) ?? []) as NoteEntryWithSignals["signals"],
    }));
  } else {
    // Default: last 7 days of entries
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split("T")[0];

    const { data: rawEntries } = await client
      .from("note_entries")
      .select("*")
      .eq("status", "active")
      .gte("entry_date", sinceStr)
      .order("entry_date", { ascending: false })
      .order("position", { ascending: true });

    if (!rawEntries || rawEntries.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const ids = rawEntries.map((e) => e.id as string);
    const { data: signals } = await client
      .from("note_entry_signals")
      .select("*")
      .in("entry_id", ids);

    const sigMap = new Map<string, object[]>();
    for (const s of signals ?? []) {
      const list = sigMap.get(s.entry_id as string) ?? [];
      list.push(s);
      sigMap.set(s.entry_id as string, list);
    }

    entries = rawEntries.map((e) => ({
      ...(e as NoteEntryWithSignals),
      signals: (sigMap.get(e.id as string) ?? []) as NoteEntryWithSignals["signals"],
    }));
  }

  if (entries.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // Load boards and columns for context
  const { data: boardsRaw } = await client.from("boards").select("*");
  const { data: columnsRaw } = await client.from("columns").select("*");
  const boards = (boardsRaw ?? []) as BoardRow[];
  const columns = (columnsRaw ?? []) as ColumnRow[];

  const systemPrompt = buildNotesOrganizeSystem();
  const userMessage = buildNotesOrganizeUser(entries, boards ?? [], columns ?? []);

  const result = await callAI(systemPrompt, userMessage, 2000);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const suggestions = normalizeNotesOrganize(result.text, entries, boards, columns);

  return NextResponse.json({ suggestions });
}
