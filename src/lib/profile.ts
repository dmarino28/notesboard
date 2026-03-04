import { supabase } from "./supabase";

export type MyProfile = {
  id: string;
  primary_region: string | null;
  regions: string[];
  role: string;
};

/**
 * Fetch the current user's profile from public.profiles.
 * Uses the browser singleton (anon key + session cookie) — call only from client-side code.
 * Returns null when there is no active session or no matching profile row.
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, primary_region, regions, role")
    .eq("id", user.id)
    .single();

  return data ? ({ ...data, regions: data.regions ?? [] } as MyProfile) : null;
}
