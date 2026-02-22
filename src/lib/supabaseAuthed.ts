import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createUserClient, extractBearerToken } from "./supabaseServer";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AuthedContext = {
  client: SupabaseClient;
  user: User;
};

/**
 * Resolve an authenticated Supabase client + user for API route handlers.
 *
 * Auth resolution order:
 *
 * 1. Cookie-based session (web app).
 *    createBrowserClient in src/lib/supabase.ts stores auth in cookies so the
 *    server can read them here via createServerClient. The middleware refreshes
 *    tokens before they reach the route handler.
 *
 * 2. Bearer token fallback (Outlook add-in, or any non-browser caller).
 *    If no cookie session is found, checks Authorization: Bearer <token>.
 *
 * Returns null when unauthenticated; the calling route should return 401.
 */
export async function getAuthedSupabase(req: Request): Promise<AuthedContext | null> {
  // ── 1. Cookie auth ───────────────────────────────────────────────────────────
  const cookieStore = await cookies();

  const cookieClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Route handlers can set cookies; ignore errors from Server Components.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // No-op when called outside a mutable cookie context.
          }
        },
      },
    },
  );

  const {
    data: { user: cookieUser },
  } = await cookieClient.auth.getUser();

  if (cookieUser) return { client: cookieClient, user: cookieUser };

  // ── 2. Bearer fallback (Outlook add-in) ─────────────────────────────────────
  const token = extractBearerToken(req.headers.get("authorization"));
  if (token) {
    const bearerClient = createUserClient(token);
    const {
      data: { user: bearerUser },
      error,
    } = await bearerClient.auth.getUser();
    if (!error && bearerUser) return { client: bearerClient, user: bearerUser };
  }

  return null;
}
