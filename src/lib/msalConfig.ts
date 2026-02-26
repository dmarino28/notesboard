import type { IPublicClientApplication } from "@azure/msal-browser";

export const GRAPH_MAIL_SCOPE = "https://graph.microsoft.com/Mail.Read";

let _instancePromise: Promise<IPublicClientApplication> | null = null;

/**
 * Returns an initialized MSAL PublicClientApplication, or null if:
 *   - NEXT_PUBLIC_MSAL_CLIENT_ID is not set, OR
 *   - called server-side (no window).
 *
 * Uses MSAL v5 createStandardPublicClientApplication which handles
 * initialize() internally. Singleton — safe to call multiple times.
 */
export async function getMsalInstance(): Promise<IPublicClientApplication | null> {
  if (typeof window === "undefined") return null;
  const clientId = process.env.NEXT_PUBLIC_MSAL_CLIENT_ID;
  if (!clientId) return null;

  if (!_instancePromise) {
    const { createStandardPublicClientApplication } = await import("@azure/msal-browser");
    _instancePromise = createStandardPublicClientApplication({
      auth: {
        clientId,
        authority: "https://login.microsoftonline.com/common",
        redirectUri: `${window.location.origin}/auth/msal-callback`,
      },
      cache: {
        // localStorage persists across page navigations (required for redirect flow)
        // and is shared across same-origin windows.
        cacheLocation: "localStorage",
      },
    });
  }

  return _instancePromise;
}

/**
 * Acquires a Mail.Read access token.
 *   1. Tries acquireTokenSilent — no UI, no navigation.
 *   2. Falls back to acquireTokenRedirect — stores a pending-auth context in
 *      localStorage, navigates the page to Microsoft login, then throws
 *      "msal_redirect_started" so callers can abort further work cleanly.
 *
 * After the redirect completes, /auth/msal-callback handles the result and
 * navigates back. Popup is NOT used: window.opener is null in this app due to
 * COOP headers, so MSAL's popup callback page cannot signal back to the opener.
 *
 * Throws a typed Error so callers can show precise messages:
 *   "msal_not_configured"   — NEXT_PUBLIC_MSAL_CLIENT_ID not set
 *   "msal_redirect_started" — interactive redirect launched; page is navigating
 *   Other MSAL errors       — network failure, consent denied, etc.
 */
export async function acquireMailToken(): Promise<string> {
  const msal = await getMsalInstance();
  if (!msal) throw new Error("msal_not_configured");

  const scopes = [GRAPH_MAIL_SCOPE];

  // Try silent first — no popup, no navigation.
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    // Ensure MSAL has an active account set; required for silent token lookup.
    if (!msal.getActiveAccount()) {
      msal.setActiveAccount(accounts[0]);
    }
    try {
      const result = await msal.acquireTokenSilent({ scopes, account: accounts[0] });
      return result.accessToken;
    } catch {
      // Silent failed (expired, no cache) — fall through to redirect.
    }
  }

  // Interactive required. Use redirect — popup is broken in this app because
  // window.opener is null after COOP headers prevent cross-window communication.
  localStorage.setItem(
    "nb_pending_mail_token",
    JSON.stringify({ startedAt: Date.now(), reason: "mail_read" }),
  );

  // This navigates the page away. The throw after it is unreachable at runtime
  // but satisfies TypeScript's control-flow analysis for the Promise<string> return type.
  await msal.acquireTokenRedirect({ scopes });
  throw new Error("msal_redirect_started");
}
