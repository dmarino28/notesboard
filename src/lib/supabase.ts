import { createBrowserClient } from "@supabase/ssr";

/**
 * Singleton Supabase client for browser use.
 * Uses createBrowserClient so auth sessions are stored in cookies in addition
 * to localStorage — this lets Next.js route handlers read the session via
 * createServerClient without requiring the client to send an explicit
 * Authorization header.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
