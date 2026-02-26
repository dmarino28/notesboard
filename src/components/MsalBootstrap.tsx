"use client";

import { useEffect } from "react";
import { getMsalInstance } from "@/lib/msalConfig";

/**
 * Mounts once in the root layout. Calls handleRedirectPromise() on every page
 * load (except /auth/msal-callback which handles it directly).
 *
 * Responsibility here is narrow: consume any stale redirect state that MSAL
 * left in localStorage, and clear nb_pending_mail_token if auth succeeded on
 * a non-callback page (edge case). All user-facing resume actions (opening
 * Outlook, navigating back) live on /auth/msal-callback where a real user
 * gesture is available.
 *
 * Renders nothing — purely a side-effect component.
 */
export function MsalBootstrap() {
  useEffect(() => {
    // /auth/msal-callback handles MSAL entirely on its own; skip here to avoid
    // double-consuming the auth response.
    if (window.location.pathname === "/auth/msal-callback") return;

    console.log("[msal] MsalBootstrap init", { path: window.location.pathname });
    getMsalInstance().then(async (msal) => {
      if (!msal) return;

      let result: Awaited<ReturnType<typeof msal.handleRedirectPromise>>;
      try {
        result = await msal.handleRedirectPromise();
      } catch (err: unknown) {
        // These codes fire on every non-redirect page load because there is
        // no pending auth state to consume. They are expected and harmless.
        const IGNORED = [
          "no_token_request_cache_error",
          "state_not_found",
          "hash_empty_error",
          "no_tokens_found",
        ];
        const text = err instanceof Error
          ? `${(err as { errorCode?: string }).errorCode ?? ""} ${err.message}`
          : String(err);
        if (IGNORED.some((code) => text.includes(code))) {
          console.info("[msal] handleRedirectPromise ignored (expected on non-callback pages):", text.trim());
        } else {
          console.error("[msal] handleRedirectPromise error", err);
        }
        return;
      }

      if (!result) {
        console.log("[msal] handleRedirectPromise resolved (no result)");
        return;
      }

      // A redirect result was found on a non-callback page (unusual).
      // Clear the pending-auth marker and log; do not attempt window.open —
      // there is no user gesture here and the browser will block it.
      // /auth/msal-callback is the authoritative resume handler.
      console.log("[msal] handleRedirectPromise resolved on non-callback page", {
        account: result.account?.username,
        scopes: result.scopes,
      });
      localStorage.removeItem("nb_pending_mail_token");
      localStorage.removeItem("nb_pending_open_thread");
    });
  }, []);

  return null;
}
