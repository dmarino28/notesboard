import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { fetchWebLinkByMessageId, fetchWebLinkForConversation } from "@/lib/graphClient";

/**
 * GET /api/outlook/message-link?thread_id={id}
 *
 * Returns the Graph webLink for a linked email thread.
 * Tries message_id direct lookup first; falls back to conversationId filter.
 *
 * Headers:
 *   X-Ms-Token: <MSAL access token with Mail.Read scope>
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { client } = auth;

  const msToken = req.headers.get("x-ms-token");
  if (!msToken) {
    return NextResponse.json({ error: "X-Ms-Token header required" }, { status: 400 });
  }

  const threadId = new URL(req.url).searchParams.get("thread_id");
  if (!threadId) {
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  const { data: thread, error } = await client
    .from("note_email_threads")
    .select("id, conversation_id, message_id, web_link")
    .eq("id", threadId)
    .single();

  if (error || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const row = thread as {
    id: string;
    conversation_id: string;
    message_id: string | null;
    web_link: string | null;
  };

  // Already stored — just return it
  if (row.web_link) {
    return NextResponse.json({ webLink: row.web_link });
  }

  // Try direct message lookup first (faster), fall back to conversationId filter
  let webLink: string | null = null;
  if (row.message_id) {
    webLink = await fetchWebLinkByMessageId(msToken, row.message_id);
  }
  if (!webLink) {
    webLink = await fetchWebLinkForConversation(msToken, row.conversation_id);
  }

  if (!webLink) {
    return NextResponse.json({ error: "Could not fetch webLink from Graph" }, { status: 502 });
  }

  // Persist for future calls
  await client
    .from("note_email_threads")
    .update({ web_link: webLink })
    .eq("id", threadId);

  return NextResponse.json({ webLink });
}
