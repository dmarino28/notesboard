import { createBrowserClient } from "@supabase/ssr";

/**
 * Singleton Supabase client for browser use.
 *
 * Main web app (any route outside /outlook/):
 *   Uses createBrowserClient's default document.cookie storage. Auth sessions
 *   are stored in cookies, which lets Next.js middleware and route handlers
 *   read the session server-side via createServerClient.
 *
 * Outlook add-in (/outlook/* routes):
 *   The Office WebView (Edge WebView2 / WKWebView) does not persist
 *   document.cookie writes after sign-in. @supabase/ssr reads the session
 *   back from document.cookie on every query; if nothing is there the request
 *   goes out as anonymous and RLS returns 0 rows with no error.
 *
 *   Fix: when on an /outlook/ route, pass a cookies adapter backed by
 *   localStorage instead of document.cookie. localStorage persists correctly
 *   in the Office WebView across component mounts and re-renders.
 *   The add-in makes only client-side Supabase queries (no SSR), so the
 *   server never needs to read the session from cookies for these routes.
 */
const isAddin =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/outlook/");

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  isAddin
    ? {
        cookies: {
          getAll() {
            return addinSessionLoad();
          },
          setAll(items) {
            const map = new Map(addinSessionLoad().map((c) => [c.name, c.value]));
            for (const c of items) {
              if (c.value) map.set(c.name, c.value);
              else map.delete(c.name);
            }
            addinSessionSave([...map.entries()].map(([name, value]) => ({ name, value })));
          },
        },
      }
    : undefined,
);

// ── localStorage helpers (add-in only) ────────────────────────────────────────

const ADDIN_SESSION_KEY = "nb_addin_session";

function addinSessionLoad(): { name: string; value: string }[] {
  try {
    const raw = localStorage.getItem(ADDIN_SESSION_KEY);
    return raw ? (JSON.parse(raw) as { name: string; value: string }[]) : [];
  } catch {
    return [];
  }
}

function addinSessionSave(items: { name: string; value: string }[]) {
  try {
    localStorage.setItem(ADDIN_SESSION_KEY, JSON.stringify(items));
  } catch {
    // Ignore — e.g. private-browsing localStorage quota exceeded.
  }
}
