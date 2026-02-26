"use client";

import { useEffect, useState } from "react";
import { getMsalInstance } from "@/lib/msalConfig";

type MsalResult =
  | { status: "pending" }
  | { status: "resolved"; account: string | null; scopes: string[] }
  | { status: "error"; errorCode: string; message: string };

type PendingOpenThread = {
  threadId: string;
  noteId?: string;
  returnPath: string;
};

type ResumeState =
  | { status: "idle" }
  | { status: "fetching" }
  | { status: "ready"; webLink: string; returnPath: string }
  | { status: "no_action"; returnPath: string }
  | { status: "link_error"; returnPath: string };

export default function MsalCallbackPage() {
  const [msalResult, setMsalResult] = useState<MsalResult>({ status: "pending" });
  const [resume, setResume] = useState<ResumeState>({ status: "idle" });

  // Snapshot these synchronously at render time so they reflect the
  // original URL before any client-side navigation can mutate them.
  const [snap] = useState(() => ({
    href: typeof window !== "undefined" ? window.location.href : "",
    hash: typeof window !== "undefined" ? window.location.hash.slice(0, 200) : "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    hasOpener: typeof window !== "undefined" ? Boolean(window.opener) : false,
    windowName: typeof window !== "undefined" ? window.name : "",
    lsKeys: typeof localStorage !== "undefined"
      ? Object.keys(localStorage).filter((k) => k.toLowerCase().includes("msal")).length
      : 0,
    ssKeys: typeof sessionStorage !== "undefined"
      ? Object.keys(sessionStorage).filter((k) => k.toLowerCase().includes("msal")).length
      : 0,
  }));

  useEffect(() => {
    console.log("[msal-callback] snapshot", snap);

    getMsalInstance().then(async (msal) => {
      if (!msal) {
        setMsalResult({
          status: "error",
          errorCode: "msal_not_configured",
          message: "NEXT_PUBLIC_MSAL_CLIENT_ID is not set.",
        });
        return;
      }

      let result: Awaited<ReturnType<typeof msal.handleRedirectPromise>>;
      try {
        result = await msal.handleRedirectPromise();
        console.log("[msal-callback] handleRedirectPromise resolved", result);
        setMsalResult({
          status: "resolved",
          account: result?.account?.username ?? null,
          scopes: result?.scopes ?? [],
        });
      } catch (err: unknown) {
        const code =
          (err as { errorCode?: string }).errorCode ??
          (err instanceof Error ? err.name : "unknown");
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[msal-callback] handleRedirectPromise error", err);
        setMsalResult({ status: "error", errorCode: code, message: msg });
        return;
      }

      // Always clean up the pending-mail-token marker.
      localStorage.removeItem("nb_pending_mail_token");

      const pendingRaw = localStorage.getItem("nb_pending_open_thread");

      if (!result) {
        // No redirect result — this page was loaded directly, not as a redirect landing.
        // Navigate back to the app root if there's a stale pending context.
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw) as PendingOpenThread;
            localStorage.removeItem("nb_pending_open_thread");
            setResume({ status: "no_action", returnPath: pending.returnPath || "/" });
          } catch {
            setResume({ status: "no_action", returnPath: "/" });
          }
        }
        return;
      }

      if (!pendingRaw) {
        // Auth completed but no pending open-thread action (e.g., auth triggered elsewhere).
        setResume({ status: "no_action", returnPath: "/" });
        return;
      }

      let pending: PendingOpenThread;
      try {
        pending = JSON.parse(pendingRaw) as PendingOpenThread;
      } catch {
        localStorage.removeItem("nb_pending_open_thread");
        setResume({ status: "no_action", returnPath: "/" });
        return;
      }

      // We have an auth result and a pending open-thread action.
      localStorage.removeItem("nb_pending_open_thread");
      setResume({ status: "fetching" });

      try {
        const res = await fetch(
          `/api/outlook/message-link?thread_id=${encodeURIComponent(pending.threadId)}`,
          { headers: { "X-Ms-Token": result.accessToken } },
        );
        if (!res.ok) {
          console.error("[msal-callback] message-link fetch failed", res.status);
          setResume({ status: "link_error", returnPath: pending.returnPath || "/" });
          return;
        }
        const json = (await res.json()) as { webLink?: string };
        if (!json.webLink) {
          setResume({ status: "link_error", returnPath: pending.returnPath || "/" });
          return;
        }
        setResume({ status: "ready", webLink: json.webLink, returnPath: pending.returnPath || "/" });
      } catch (err) {
        console.error("[msal-callback] message-link error", err);
        setResume({ status: "link_error", returnPath: pending.returnPath || "/" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const returnPath =
    resume.status === "ready" || resume.status === "no_action" || resume.status === "link_error"
      ? resume.returnPath
      : "/";

  return (
    <div style={{ fontFamily: "monospace", fontSize: 12, padding: 24, color: "#ccc", background: "#111", minHeight: "100vh" }}>

      {/* ── Resume banner (shown when there's a meaningful state) ── */}
      {(resume.status !== "idle") && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 8, background: "#0f1a0f", border: "1px solid #1a3a1a" }}>
          {resume.status === "fetching" && (
            <p style={{ margin: 0, color: "#86efac" }}>Sign-in complete. Fetching your Outlook link…</p>
          )}
          {resume.status === "ready" && (
            <>
              <p style={{ margin: "0 0 12px", color: "#86efac", fontWeight: "bold" }}>
                ✓ Sign-in complete
              </p>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <a
                  href={resume.webLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "6px 14px",
                    background: "#4f46e5",
                    color: "#fff",
                    borderRadius: 6,
                    textDecoration: "none",
                    fontSize: 13,
                  }}
                >
                  Open in Outlook →
                </a>
                <a
                  href={returnPath}
                  style={{ color: "#818cf8", fontSize: 12, textDecoration: "underline" }}
                >
                  Return to app
                </a>
              </div>
            </>
          )}
          {resume.status === "no_action" && (
            <>
              <p style={{ margin: "0 0 8px", color: "#86efac" }}>✓ Sign-in complete.</p>
              <a
                href={returnPath}
                style={{ color: "#818cf8", fontSize: 12, textDecoration: "underline" }}
              >
                Return to app →
              </a>
            </>
          )}
          {resume.status === "link_error" && (
            <>
              <p style={{ margin: "0 0 4px", color: "#fca5a5" }}>
                Sign-in complete, but could not fetch the Outlook link.
              </p>
              <p style={{ margin: "0 0 8px", color: "#9ca3af", fontSize: 11 }}>
                The message may have been moved or deleted. Try opening it from the card again.
              </p>
              <a
                href={returnPath}
                style={{ color: "#818cf8", fontSize: 12, textDecoration: "underline" }}
              >
                Return to app →
              </a>
            </>
          )}
        </div>
      )}

      {/* ── Debug panel ── */}
      <p style={{ fontSize: 14, fontWeight: "bold", marginBottom: 16, color: "#fff" }}>
        /auth/msal-callback debug panel
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {([
            ["href", snap.href],
            ["hash (first 200)", snap.hash || "(empty)"],
            ["document.referrer", snap.referrer || "(empty)"],
            ["window.opener", String(snap.hasOpener)],
            ["window.name", snap.windowName || "(empty)"],
            ["localStorage MSAL keys", String(snap.lsKeys)],
            ["sessionStorage MSAL keys", String(snap.ssKeys)],
          ] as [string, string][]).map(([label, value]) => (
            <tr key={label} style={{ borderBottom: "1px solid #222" }}>
              <td style={{ padding: "6px 12px 6px 0", color: "#888", whiteSpace: "nowrap", verticalAlign: "top" }}>
                {label}
              </td>
              <td style={{ padding: "6px 0", wordBreak: "break-all" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 24, padding: 12, borderRadius: 6, background: "#1a1a1a", border: "1px solid #333" }}>
        <p style={{ margin: 0, fontWeight: "bold", color: "#888" }}>handleRedirectPromise</p>
        {msalResult.status === "pending" && (
          <p style={{ margin: "8px 0 0", color: "#aaa" }}>running…</p>
        )}
        {msalResult.status === "resolved" && (
          <p style={{ margin: "8px 0 0", color: "#4ade80" }}>
            ✓ resolved — account: {msalResult.account ?? "(none)"}{" "}
            {msalResult.scopes.length > 0 && `| scopes: ${msalResult.scopes.join(", ")}`}
          </p>
        )}
        {msalResult.status === "error" && (
          <>
            <p style={{ margin: "8px 0 0", color: "#f87171" }}>
              ✗ error — <strong>{msalResult.errorCode}</strong>
            </p>
            <p style={{ margin: "4px 0 0", color: "#fca5a5", wordBreak: "break-word" }}>
              {msalResult.message}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
