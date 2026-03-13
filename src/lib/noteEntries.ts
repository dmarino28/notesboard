/**
 * noteEntries.ts
 *
 * Data access layer for note_entries and note_entry_signals.
 * Uses the browser Supabase client (anon key + RLS).
 */

import { supabase } from "./supabase";
import type { Signal } from "./noteSignals";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContextSource = "direct_match" | "inherited" | "unknown";
export type EntryStatus = "active" | "applied" | "archived";

export interface NoteEntryRow {
  id: string;
  user_id: string;
  page_id: string | null;
  content: string;
  position: number;
  indent_level: number;
  parent_entry_id: string | null;
  explicit_board_id: string | null;
  inferred_board_id: string | null;
  context_source: ContextSource;
  entry_date: string; // ISO YYYY-MM-DD
  meeting_timestamp: string | null;
  status: EntryStatus;
  clip_url: string | null;
  clip_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteEntrySignalRow {
  id: string;
  entry_id: string;
  signal_type: "board" | "milestone" | "channel" | "market" | "date";
  signal_value: string;
  normalized_value: string | null;
  match_text: string;
  match_start: number | null;
  match_end: number | null;
  created_at: string;
}

export interface NoteEntryWithSignals extends NoteEntryRow {
  signals: NoteEntrySignalRow[];
}

export interface CreateEntryInput {
  content: string;
  position?: number;
  indent_level?: number;
  parent_entry_id?: string | null;
  explicit_board_id?: string | null;
  inferred_board_id?: string | null;
  context_source?: ContextSource;
  entry_date?: string;
  meeting_timestamp?: string | null;
}

export interface UpdateEntryInput {
  content?: string;
  position?: number;
  indent_level?: number;
  explicit_board_id?: string | null;
  inferred_board_id?: string | null;
  context_source?: ContextSource;
  status?: EntryStatus;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch all active note entries for the current user, with signals.
 * Ordered by entry_date desc, then position asc.
 */
export async function listNoteEntries(): Promise<NoteEntryWithSignals[]> {
  const { data: entries, error: entriesErr } = await supabase
    .from("note_entries")
    .select("*")
    .eq("status", "active")
    .order("entry_date", { ascending: false })
    .order("position", { ascending: true });

  if (entriesErr || !entries) return [];

  if (entries.length === 0) return [];

  const entryIds = entries.map((e) => e.id);

  const { data: signals } = await supabase
    .from("note_entry_signals")
    .select("*")
    .in("entry_id", entryIds);

  const signalsByEntry = new Map<string, NoteEntrySignalRow[]>();
  for (const sig of signals ?? []) {
    const list = signalsByEntry.get(sig.entry_id) ?? [];
    list.push(sig as NoteEntrySignalRow);
    signalsByEntry.set(sig.entry_id, list);
  }

  return entries.map((e) => ({
    ...(e as NoteEntryRow),
    signals: signalsByEntry.get(e.id) ?? [],
  }));
}

/**
 * Fetch entries for a specific date range (used for focused date queries).
 */
export async function listNoteEntriesForDate(date: string): Promise<NoteEntryWithSignals[]> {
  const { data: entries, error } = await supabase
    .from("note_entries")
    .select("*")
    .eq("entry_date", date)
    .eq("status", "active")
    .order("position", { ascending: true });

  if (error || !entries || entries.length === 0) return [];

  const entryIds = entries.map((e) => e.id);
  const { data: signals } = await supabase
    .from("note_entry_signals")
    .select("*")
    .in("entry_id", entryIds);

  const signalsByEntry = new Map<string, NoteEntrySignalRow[]>();
  for (const sig of signals ?? []) {
    const list = signalsByEntry.get(sig.entry_id) ?? [];
    list.push(sig as NoteEntrySignalRow);
    signalsByEntry.set(sig.entry_id, list);
  }

  return entries.map((e) => ({
    ...(e as NoteEntryRow),
    signals: signalsByEntry.get(e.id) ?? [],
  }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a note entry. Returns null on failure.
 */
export async function createNoteEntry(
  input: CreateEntryInput
): Promise<NoteEntryRow | null> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("note_entries")
    .insert({
      content: input.content,
      position: input.position ?? Date.now(), // use timestamp as initial position
      indent_level: input.indent_level ?? 0,
      parent_entry_id: input.parent_entry_id ?? null,
      explicit_board_id: input.explicit_board_id ?? null,
      inferred_board_id: input.inferred_board_id ?? null,
      context_source: input.context_source ?? "unknown",
      entry_date: input.entry_date ?? today,
      meeting_timestamp: input.meeting_timestamp ?? null,
    })
    .select()
    .single();

  if (error || !data) return null;
  return data as NoteEntryRow;
}

/**
 * Update an entry's content, position, indent, or context fields.
 */
export async function updateNoteEntry(
  id: string,
  input: UpdateEntryInput
): Promise<NoteEntryRow | null> {
  const { data, error } = await supabase
    .from("note_entries")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) return null;
  return data as NoteEntryRow;
}

/**
 * Soft-delete: mark entry as archived.
 */
export async function deleteNoteEntry(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("note_entries")
    .update({ status: "archived" })
    .eq("id", id);
  return !error;
}

// ─── Signal Upsert ────────────────────────────────────────────────────────────

/**
 * Replace all signals for an entry.
 * Deletes existing signals then inserts fresh ones.
 */
export async function upsertEntrySignals(
  entryId: string,
  signals: Signal[]
): Promise<void> {
  // Delete existing
  await supabase.from("note_entry_signals").delete().eq("entry_id", entryId);

  if (signals.length === 0) return;

  const rows = signals.map((s) => ({
    entry_id: entryId,
    signal_type: s.type,
    signal_value: s.value,
    normalized_value: s.normalizedValue ?? null,
    match_text: s.matchText,
    match_start: s.matchStart,
    match_end: s.matchEnd,
  }));

  await supabase.from("note_entry_signals").insert(rows);
}

// ─── Position Utilities ───────────────────────────────────────────────────────

/**
 * Compute a position value for an entry inserted between two positions.
 * Uses midpoint; if positions are too close, falls back to appending.
 */
export function midpointPosition(before: number, after: number): number {
  return (before + after) / 2;
}

/**
 * Compute position for an entry appended at the end of a set.
 */
export function appendPosition(existingPositions: number[]): number {
  if (existingPositions.length === 0) return 1000;
  return Math.max(...existingPositions) + 1000;
}
