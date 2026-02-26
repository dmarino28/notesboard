/**
 * Fetches the Outlook webLink (deep URL to open the conversation in OWA)
 * for a given conversationId using a Microsoft Graph access token.
 *
 * Takes the most recently received message in the conversation and returns
 * its webLink — opening it in OWA renders the full conversation thread.
 *
 * Requires Mail.Read scope. Works for both personal (Outlook.com) and
 * work/school (Microsoft 365) accounts via the /common authority.
 */
export async function fetchWebLinkForConversation(
  accessToken: string,
  conversationId: string,
): Promise<string | null> {
  const filter = `conversationId eq '${conversationId}'`;
  const url =
    `https://graph.microsoft.com/v1.0/me/messages` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$top=1` +
    `&$orderby=receivedDateTime+desc` +
    `&$select=webLink,conversationId` +
    `&$count=true`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Required when combining $filter + $orderby on non-default index
        ConsistencyLevel: "eventual",
      },
    });
    if (!res.ok) return null;
    const json = await res.json() as { value?: Array<{ webLink?: string }> };
    return json.value?.[0]?.webLink ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches the webLink for a specific message by its message ID.
 * Faster than the conversationId-based lookup when message_id is known.
 */
export async function fetchWebLinkByMessageId(
  accessToken: string,
  messageId: string,
): Promise<string | null> {
  const url =
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}` +
    `?$select=webLink`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { webLink?: string };
    return json.webLink ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches the most recent message in a conversation.
 * Returns receivedDateTime and webLink, or null if none found.
 * Used by poll-waiting to check if a reply arrived after waiting_since_at.
 */
export async function fetchLatestConversationMessage(
  accessToken: string,
  conversationId: string,
): Promise<{ receivedDateTime: string; webLink: string } | null> {
  const filter = `conversationId eq '${conversationId}'`;
  const url =
    `https://graph.microsoft.com/v1.0/me/messages` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$top=1` +
    `&$orderby=receivedDateTime+desc` +
    `&$select=receivedDateTime,webLink` +
    `&$count=true`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ConsistencyLevel: "eventual",
      },
    });
    if (!res.ok) return null;
    const json = await res.json() as { value?: Array<{ receivedDateTime?: string; webLink?: string }> };
    const msg = json.value?.[0];
    if (!msg?.receivedDateTime) return null;
    return { receivedDateTime: msg.receivedDateTime, webLink: msg.webLink ?? "" };
  } catch {
    return null;
  }
}
