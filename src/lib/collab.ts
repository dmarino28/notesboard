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
  actor_user_id: string | null;
  activity_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CollabData = {
  updates: NoteUpdate[];
  activity: NoteActivity[];
  /** The authenticated user's id — used to show "You" attribution in the UI. */
  currentUserId?: string;
};

type CollabOpts = {
  /** Explicit Bearer token — used by the Outlook add-in which has no browser cookie. */
  bearerToken?: string;
};

/**
 * Fetch collab data (updates + activity) for a note.
 *
 * Web app: no Authorization header needed — the browser sends auth cookies
 * automatically and the route handler resolves them via getAuthedSupabase.
 *
 * Outlook add-in: pass opts.bearerToken to attach an Authorization header.
 *
 * Returns:
 *   - CollabData on success
 *   - null when unauthenticated (HTTP 401) — caller should show "Sign in" state
 *   - CollabData with empty arrays on other errors (non-critical)
 */
export async function listCollab(noteId: string, opts?: CollabOpts): Promise<CollabData | null> {
  const headers: Record<string, string> = {};
  if (opts?.bearerToken) headers["Authorization"] = `Bearer ${opts.bearerToken}`;

  try {
    const res = await fetch(`/api/notes/${noteId}/collab`, { headers });
    if (res.status === 401) return null;
    if (!res.ok) return { updates: [], activity: [] };
    return (await res.json()) as CollabData;
  } catch {
    return { updates: [], activity: [] };
  }
}

/**
 * Post an update for a note.
 *
 * Web app: cookies authenticate automatically.
 * Outlook add-in: pass opts.bearerToken.
 */
export async function postNoteUpdate(
  noteId: string,
  params: {
    content: string;
    statusChange?: NoteStatus | null;
    dueDateChange?: string | null;
  },
  opts?: CollabOpts,
): Promise<{ error: string | null }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.bearerToken) headers["Authorization"] = `Bearer ${opts.bearerToken}`;

  const res = await fetch(`/api/notes/${noteId}/update`, {
    method: "POST",
    headers,
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
