import { supabase } from "./supabase";

export type WeekEndDay = "friday" | "saturday" | "sunday";

export const DEFAULT_WEEK_END: WeekEndDay = "friday";

const VALID_WEEK_ENDS = new Set<string>(["friday", "saturday", "sunday"]);

export async function getWeekEndPreference(): Promise<WeekEndDay> {
  const { data } = await supabase.auth.getUser();
  const raw = data?.user?.user_metadata?.week_end as string | undefined;
  if (raw && VALID_WEEK_ENDS.has(raw)) return raw as WeekEndDay;
  return DEFAULT_WEEK_END;
}

export async function setWeekEndPreference(day: WeekEndDay): Promise<void> {
  await supabase.auth.updateUser({ data: { week_end: day } });
}
