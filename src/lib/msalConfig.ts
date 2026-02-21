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
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: "sessionStorage",
      },
    });
  }

  return _instancePromise;
}
