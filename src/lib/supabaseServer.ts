import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-only operations that must bypass RLS
 * (e.g. generating storage signed URLs after app-level access checks).
 * NEVER expose this client or its key to the browser.
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Create a request-scoped Supabase client authenticated by the user's access token.
 * The token is forwarded in the Authorization header so Supabase evaluates
 * auth.uid() correctly in RLS policies.
 *
 * Usage in API routes:
 *   const token = extractBearerToken(req.headers.get("authorization"));
 *   if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   const client = createUserClient(token);
 *   const { data: { user } } = await client.auth.getUser();
 */
export function createUserClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
  );
}

/** Extract Bearer token from an Authorization header. Returns null if absent or malformed. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}
