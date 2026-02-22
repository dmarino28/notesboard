import { supabase } from "./supabase";

export type NoteStatus = "on_track" | "at_risk" | "blocked" | "done";

export const STATUS_VALUES: NoteStatus[] = ["on_track", "at_risk", "blocked", "done"];

export const STATUS_META: Record<
  NoteStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  on_track: {
    label: "On Track",
    dotClass: "bg-emerald-500",
    badgeClass: "bg-emerald-950/60 text-emerald-400",
  },
  at_risk: {
    label: "At Risk",
    dotClass: "bg-amber-500",
    badgeClass: "bg-amber-950/60 text-amber-400",
  },
  blocked: {
    label: "Blocked",
    dotClass: "bg-red-500",
    badgeClass: "bg-red-950/60 text-red-400",
  },
  done: {
    label: "Done",
    dotClass: "bg-neutral-500",
    badgeClass: "bg-neutral-800/60 text-neutral-500",
  },
};

export type NoteUpdate = {
  id: string;
  note_id: string;
  user_id: string | null;
  content: string;
  status_change: string | null;
  due_date_change: string | null;
  created_at: string;
};

export type NoteActivity = {
  id: string;
  note_id: string;
  activity_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CollabData = {
  updates: NoteUpdate[];
  activity: NoteActivity[];
};

export async function listCollab(noteId: string): Promise<CollabData> {
  const [updatesResult, activityResult] = await Promise.all([
    supabase
      .from("note_updates")
      .select("id, note_id, user_id, content, status_change, due_date_change, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true }),
    supabase
      .from("note_activity")
      .select("id, note_id, activity_type, payload, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    updates: (updatesResult.data ?? []) as NoteUpdate[],
    activity: (activityResult.data ?? []) as NoteActivity[],
  };
}

export async function postNoteUpdate(
  noteId: string,
  params: {
    content: string;
    statusChange?: NoteStatus | null;
    dueDateChange?: string | null;
  },
): Promise<{ error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? null;

  const res = await fetch(`/api/notes/${noteId}/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      content: params.content,
      status_change: params.statusChange ?? null,
      due_date_change: params.dueDateChange ?? null,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? `HTTP ${res.status}` };
  }

  return { error: null };
}
