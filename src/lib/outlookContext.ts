/**
 * Supplemental Outlook item state read synchronously alongside the main thread.
 * All fields are nullable — availability depends on host version and item type.
 */
export type OutlookItemExtras = {
  /** null = unavailable (req set < 1.6, compose mode, or any error) */
  flagStatus: "flagged" | "complete" | "notFlagged" | null;
  /** ISO YYYY-MM-DD from flag.dueDateTime, or null if not set */
  followUpDate: string | null;
};

export type OutlookThread = {
  conversationId: string;
  messageId: string;
  webLink: string | null;
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

/**
 * Synchronously reads flag state from the currently open Outlook item.
 *
 * Requires Mailbox requirement set 1.6+ (Outlook 2016+, OWA, Outlook.com).
 * Returns null-safe fallback values on any host/version that does not support
 * item.flag, in compose mode, or on any unexpected error.
 *
 * Safe to call after Office.onReady; does not require an async REST token.
 */
export function readItemExtras(): OutlookItemExtras {
  try {
    // item.flag requires Mailbox 1.6+ and is only present on MessageRead.
    // Cast through unknown because older @types/office-js doesn't type the flag
    // property — runtime values of FlagStatus are plain strings ("flagged" etc.).
    type ItemWithFlag = {
      flag?: {
        flagStatus?: string;
        dueDateTime?: Date | null;
      } | null;
    } | null;
    const item = Office.context.mailbox.item as unknown as ItemWithFlag;
    if (!item?.flag) return { flagStatus: null, followUpDate: null };

    const s = item.flag.flagStatus;
    const flagStatus: OutlookItemExtras["flagStatus"] =
      s === "flagged"    ? "flagged"    :
      s === "complete"   ? "complete"   :
      s === "notFlagged" ? "notFlagged" : null;

    const followUpDate = item.flag.dueDateTime
      ? item.flag.dueDateTime.toISOString().slice(0, 10) // → "YYYY-MM-DD"
      : null;

    return { flagStatus, followUpDate };
  } catch {
    return { flagStatus: null, followUpDate: null };
  }
}

// ── Outlook REST web-link helper ──────────────────────────────────────────────

/**
 * Best-effort fetch of the OWA deep-link for the current message using the
 * Office.js REST callback token (Exchange Online + Outlook.com).
 *
 * 4-second timeout — silently returns null on any failure (deprecated
 * endpoint, permission denied, network error, timeout, etc.).
 * Callers fall back to OWA subject-search or the MSAL connect flow.
 */
async function fetchRestWebLink(
  mailbox: Office.Mailbox,
  ewsItemId: string,
): Promise<string | null> {
  if (!ewsItemId) return null;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 4_000);
    try {
      mailbox.getCallbackTokenAsync({ isRest: true }, (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          clearTimeout(timeout);
          resolve(null);
          return;
        }
        let restId: string;
        try {
          restId = mailbox.convertToRestId(
            ewsItemId,
            Office.MailboxEnums.RestVersion.v2_0,
          );
        } catch {
          clearTimeout(timeout);
          resolve(null);
          return;
        }
        // mailbox.restUrl is available when isRest token was granted
        const restBase =
          (mailbox as unknown as { restUrl?: string }).restUrl ??
          "https://outlook.office.com/api";
        const url = `${restBase}/v2.0/me/messages/${encodeURIComponent(restId)}?$select=WebLink`;
        fetch(url, { headers: { Authorization: `Bearer ${result.value}` } })
          .then(async (res) => {
            clearTimeout(timeout);
            if (!res.ok) { resolve(null); return; }
            const json = await res.json() as { WebLink?: string };
            resolve(json.WebLink ?? null);
          })
          .catch(() => { clearTimeout(timeout); resolve(null); });
      });
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synchronously reads the current Outlook item context.
 *
 * Designed for use inside an `ItemChanged` event handler where async operations
 * are not practical. Unlike `readOutlookItem()`, this does NOT fetch the REST
 * web-link (webLink is always null here) and does NOT wait for Office.onReady.
 *
 * Returns null when:
 *   - `Office.context.mailbox.item` is null (folder selected, calendar, multi-select)
 *   - The selected item has no conversationId (e.g. a draft or calendar event)
 *   - Any other unexpected error reading the context
 */
export function readCurrentItemSync(): OutlookThread | null {
  try {
    const mailbox = Office.context.mailbox;
    const item = mailbox.item;
    if (!item) return null;
    const conversationId = item.conversationId ?? "";
    if (!conversationId) return null;
    return {
      conversationId,
      messageId: item.itemId || "",
      webLink: null, // async fetch not possible in sync handler
      subject: item.subject ?? "",
      provider: "outlook",
      mailbox: mailbox.userProfile.emailAddress ?? "",
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // Best-effort: fetch the OWA deep-link via the Outlook REST callback token.
  // Silently returns null for consumer accounts or if the endpoint is
  // unavailable — the board view MSAL connect flow handles that case.
  const mailbox = Office.context.mailbox;
  const webLink = await fetchRestWebLink(mailbox, messageId);

  return {
    kind: "ok",
    thread: {
      conversationId,
      messageId,
      webLink,
      subject: item.subject ?? "",
      provider: "outlook",
      mailbox: mailbox.userProfile.emailAddress ?? "",
    },
  };
}
