export type OutlookThread = {
  conversationId: string;
  messageId: string;
  webLink: string | null; // null until Phase 3 (requires Graph API + getItemRestId)
  subject: string;
  provider: "outlook";
  mailbox: string;
};

/**
 * Discriminated result from readOutlookItem().
 *   no_office — Office.js never became available; use dev/fallback mode.
 *   error     — Office.js loaded but context couldn't be read (wrong host,
 *               no item open, calendar item, etc.).
 *   ok        — Real Outlook item context was read successfully.
 */
export type ReadItemResult =
  | { kind: "no_office" }
  | { kind: "error"; message: string }
  | { kind: "ok"; thread: OutlookThread };

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 10_000; // wait up to 10s for Office.js to appear
const READY_TIMEOUT_MS = 8_000; // wait up to 8s for Office.onReady

/**
 * Reads the current Outlook item context via Office.js.
 *
 * - Polls up to 10s for Office.js to be injected by the host (OWA injects it
 *   before the task-pane page loads; polling handles the rare race with Next.js
 *   hydration timing).
 * - Returns { kind: "no_office" } when running in a plain browser (dev mode).
 * - Returns { kind: "error", message } when Office is available but the context
 *   can't be read (wrong host, no email open, calendar item, etc.).
 * - Returns { kind: "ok", thread } on success.
 */
export async function readOutlookItem(): Promise<ReadItemResult> {
  if (typeof window === "undefined") return { kind: "no_office" };

  // Poll until Office.js is defined or we time out.
  if (typeof Office === "undefined") {
    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const iv = setInterval(() => {
        elapsed += POLL_INTERVAL_MS;
        if (typeof Office !== "undefined" || elapsed >= POLL_TIMEOUT_MS) {
          clearInterval(iv);
          resolve();
        }
      }, POLL_INTERVAL_MS);
    });
  }

  if (typeof Office === "undefined") return { kind: "no_office" };

  // Wait for Office to signal it is ready.
  const info = await Promise.race([
    new Promise<{ host: Office.HostType | null; platform: Office.PlatformType | null }>(
      (resolve) => Office.onReady(resolve),
    ),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
  ]);

  if (!info) {
    return { kind: "error", message: "Office timed out. Close and reopen the pane." };
  }
  if (info.host !== Office.HostType.Outlook) {
    return { kind: "error", message: "This add-in only works in Outlook." };
  }

  const item = Office.context.mailbox.item;
  if (!item) {
    return {
      kind: "error",
      message: "Couldn't read email context. Please open an email and try again.",
    };
  }

  // item.subject, item.conversationId, item.itemId are synchronous in read mode.
  const conversationId = item.conversationId ?? "";
  if (!conversationId) {
    return {
      kind: "error",
      message: "This item type isn't supported. Please open a message.",
    };
  }

  // Store the EWS item.itemId — this is what displayMessageForm() needs to open
  // the exact message inside Outlook. internetMessageId is more stable across
  // folder moves but cannot be used with displayMessageForm.
  const messageId = item.itemId || "";

  return {
    kind: "ok",
    thread: {
      conversationId,
      messageId,
      webLink: null,
      subject: item.subject ?? "",
      provider: "outlook",
      mailbox: Office.context.mailbox.userProfile.emailAddress ?? "",
    },
  };
}
