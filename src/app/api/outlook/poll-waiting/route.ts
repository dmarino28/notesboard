import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { fetchLatestConversationMessage } from "@/lib/graphClient";

type WaitingRow = {
  note_id: string;
  waiting_conversation_id: string;
  waiting_since_at: string;
};

/**
 * POST /api/outlook/poll-waiting
 *
 * Checks all "waiting" actions that have a linked conversation.
 * For each, queries Graph to see if a new message arrived after waiting_since_at.
 * If so, promotes the card back to needs_action with today's date.
 *
 * Headers:
 *   X-Ms-Token: <MSAL access token with Mail.Read scope>
 *
 * Returns: { updated: number }
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { client, user } = auth;

  const msToken = req.headers.get("x-ms-token");
  if (!msToken) {
    return NextResponse.json({ error: "X-Ms-Token header required" }, { status: 400 });
  }

  // Fetch all waiting actions with a conversation to poll
  const { data: waitingRows, error } = await client
    .from("note_user_actions")
    .select("note_id, waiting_conversation_id, waiting_since_at")
    .eq("user_id", user.id)
    .eq("action_state", "waiting")
    .not("waiting_conversation_id", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (waitingRows ?? []) as WaitingRow[];
  if (rows.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let updated = 0;

  for (const row of rows) {
    const latest = await fetchLatestConversationMessage(msToken, row.waiting_conversation_id);
    if (!latest) continue;

    // A new reply arrived after we started waiting
    if (latest.receivedDateTime > row.waiting_since_at) {
      const { error: updateError } = await client
        .from("note_user_actions")
        .update({
          action_state: "needs_action",
          personal_due_date: today,
          waiting_conversation_id: null,
          waiting_since_at: null,
          waiting_mailbox: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("note_id", row.note_id);

      if (!updateError) updated++;
    }
  }

  return NextResponse.json({ updated });
}
