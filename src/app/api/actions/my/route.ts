import { NextRequest, NextResponse } from "next/server";
import { createUserClient, extractBearerToken } from "@/lib/supabaseServer";
import type { BucketedNote, MyActionsResult } from "@/lib/userActions";

type RawActionRow = {
  note_id: string;
  action_state: string;
  personal_due_date: string | null;
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

/** Compare two date strings (YYYY-MM-DD) for equality. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = createUserClient(token);
  const { data: { user }, error: authErr } = await client.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await client
    .from("note_user_actions")
    .select("note_id, action_state, personal_due_date, notes(id, content, due_date)")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bucket boundaries (wall-clock dates, no time)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const thisWeekEnd = new Date(todayStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

  const result: MyActionsResult = {
    overdue: [],
    today: [],
    tomorrow: [],
    this_week: [],
    beyond: [],
    waiting: [],
    done: [],
  };

  for (const row of (data ?? []) as RawActionRow[]) {
    const note = resolveNote(row.notes);
    if (!note) continue;

    const effectiveDue = row.personal_due_date ?? note.due_date;

    const card: BucketedNote = {
      note_id: row.note_id,
      content: note.content,
      action_state: row.action_state as BucketedNote["action_state"],
      personal_due_date: row.personal_due_date,
      effective_due_date: effectiveDue,
    };

    if (row.action_state === "done") {
      result.done.push(card);
    } else if (row.action_state === "waiting") {
      result.waiting.push(card);
    } else {
      // needs_action — bucket by effective due date
      if (!effectiveDue) {
        result.beyond.push(card);
        continue;
      }
      // Parse as local date (YYYY-MM-DD without time → no timezone shift)
      const [y, m, d] = effectiveDue.split("-").map(Number);
      const due = new Date(y, m - 1, d);

      if (due < todayStart) {
        result.overdue.push(card);
      } else if (sameDay(due, todayStart)) {
        result.today.push(card);
      } else if (sameDay(due, tomorrowStart)) {
        result.tomorrow.push(card);
      } else if (due <= thisWeekEnd) {
        result.this_week.push(card);
      } else {
        result.beyond.push(card);
      }
    }
  }

  return NextResponse.json(result);
}
