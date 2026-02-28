import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import type { BucketedNote, MyActionsResult } from "@/lib/userActions";

type RawActionRow = {
  note_id: string;
  action_state: string;
  action_mode: string;
  private_tags: string[];
  notes:
    | { id: string; content: string; due_date: string | null }
    | { id: string; content: string; due_date: string | null }[]
    | null;
};

function resolveNote(
  n: RawActionRow["notes"],
): { id: string; content: string; due_date: string | null } | null {
  if (!n) return null;
  if (Array.isArray(n)) return n[0] ?? null;
  return n;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Upcoming Friday — returns today if today is Friday. */
function upcomingFriday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun … 5=Fri
  if (day === 5) return d;
  const daysUntil = (5 - day + 7) % 7;
  d.setDate(d.getDate() + daysUntil);
  return d;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { client } = auth;

  const { data, error } = await client
    .from("note_user_actions")
    .select(
      "note_id, action_state, action_mode, private_tags, notes(id, content, due_date)",
    )
    .in("action_state", ["needs_action", "waiting", "done"])
    .eq("is_in_actions", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[/api/actions/my] Supabase query error:", error);
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as RawActionRow[];

  // Detect inbox notes: those with no placement rows
  const noteIds = rows.map((r) => r.note_id).filter(Boolean);
  let inboxSet = new Set<string>();
  if (noteIds.length > 0) {
    const { data: placements } = await client
      .from("note_placements")
      .select("note_id")
      .in("note_id", noteIds);
    const placedIds = new Set((placements ?? []).map((p) => p.note_id as string));
    inboxSet = new Set(noteIds.filter((id) => !placedIds.has(id)));
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const thisFriday = upcomingFriday(todayStart);

  const result: MyActionsResult = {
    overdue: [],
    today: [],
    tomorrow: [],
    this_week: [],
    beyond: [],
    waiting: [],
    done: [],
    flagged: [],
  };

  for (const row of rows) {
    const note = resolveNote(row.notes);
    if (!note) continue;

    // Canonical due date: notes.due_date only.
    const dueDate = note.due_date;
    const action_mode = (row.action_mode === "flagged" ? "flagged" : "timed") as BucketedNote["action_mode"];

    const card: BucketedNote = {
      note_id: row.note_id,
      content: note.content,
      action_state: row.action_state as BucketedNote["action_state"],
      action_mode,
      due_date: dueDate,
      private_tags: row.private_tags ?? [],
      is_inbox: inboxSet.has(row.note_id),
    };

    // Flagged items go to their own bucket regardless of action_state
    if (action_mode === "flagged") {
      result.flagged.push(card);
      continue;
    }

    // Waiting / Done — bucketed by action_state; due_date is informational only
    if (row.action_state === "done") {
      result.done.push(card);
    } else if (row.action_state === "waiting") {
      result.waiting.push(card);
    } else {
      // needs_action: bucket by notes.due_date
      if (!dueDate) {
        result.beyond.push(card);
        continue;
      }
      const [y, m, d] = dueDate.split("T")[0].split("-").map(Number);
      const due = new Date(y, m - 1, d);

      if (due < todayStart) {
        result.overdue.push(card);
      } else if (sameDay(due, todayStart)) {
        result.today.push(card);
      } else if (sameDay(due, tomorrowStart)) {
        result.tomorrow.push(card);
      } else if (due <= thisFriday) {
        result.this_week.push(card);
      } else {
        result.beyond.push(card);
      }
    }
  }

  return NextResponse.json(result);
}
