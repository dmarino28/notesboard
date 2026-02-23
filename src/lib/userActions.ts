import { supabase } from "./supabase";

export type ActionState = "needs_action" | "waiting" | "done";

export type UserActionRow = {
  action_state: ActionState;
  personal_due_date: string | null;
  private_tags: string[];
};

export type NoteActionMap = Record<string, UserActionRow>;

export type BucketedNote = {
  note_id: string;
  content: string;
  action_state: ActionState;
  personal_due_date: string | null;
  effective_due_date: string | null;
  private_tags: string[];
};

export type MyActionsResult = {
  overdue: BucketedNote[];
  today: BucketedNote[];
  tomorrow: BucketedNote[];
  this_week: BucketedNote[];
  beyond: BucketedNote[];
  waiting: BucketedNote[];
  done: BucketedNote[];
};

export type ViewFilters = {
  categories: string[];
  dueFilter: "all" | "overdue" | "today" | "this_week";
  sort: "due_asc" | "added_asc";
  search: string;
};

export const DEFAULT_FILTERS: ViewFilters = {
  categories: [],
  dueFilter: "all",
  sort: "due_asc",
  search: "",
};

export type SavedView = {
  id: string;
  name: string;
  filters: ViewFilters;
  created_at: string;
};

// Cycle order for the 1-click toggle: none → needs_action → waiting → done → none
const ACTION_CYCLE: Array<ActionState | "none"> = ["none", "needs_action", "waiting", "done"];

export function cycleActionState(current: ActionState | null | undefined): ActionState | "none" {
  const curr = current ?? "none";
  const idx = ACTION_CYCLE.indexOf(curr as ActionState | "none");
  return ACTION_CYCLE[(idx + 1) % ACTION_CYCLE.length];
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Fetch action states for a list of note_ids.
 * Returns empty map silently if unauthenticated.
 */
export async function fetchActionsForNotes(noteIds: string[]): Promise<NoteActionMap> {
  if (noteIds.length === 0) return {};
  const headers = await getAuthHeaders();
  try {
    const params = new URLSearchParams({ ids: noteIds.join(",") });
    const res = await fetch(`/api/actions/for-notes?${params.toString()}`, { headers });
    if (!res.ok) return {};
    return (await res.json()) as NoteActionMap;
  } catch {
    return {};
  }
}

/**
 * Set (or clear) the action state for a note.
 * Passing "none" deletes the row.
 * Returns the saved row, or null on delete / failure / unauthenticated.
 */
export async function setNoteAction(
  noteId: string,
  state: ActionState | "none",
  personalDueDate?: string | null,
): Promise<UserActionRow | null> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch("/api/actions/set", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        note_id: noteId,
        action_state: state,
        personal_due_date: personalDueDate ?? null,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      deleted?: boolean;
      action_state?: ActionState;
      personal_due_date?: string | null;
      private_tags?: string[];
    };
    if (json.deleted) return null;
    if (json.action_state) {
      return {
        action_state: json.action_state,
        personal_due_date: json.personal_due_date ?? null,
        private_tags: json.private_tags ?? [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Update only the private_tags on a note's action row (partial update).
 * Does NOT affect action_state or personal_due_date.
 * Best-effort; caller should optimistically update state before calling.
 */
export async function updateNoteActionTags(
  noteId: string,
  tags: string[],
): Promise<void> {
  const headers = await getAuthHeaders();
  try {
    await fetch("/api/actions/set", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ note_id: noteId, private_tags: tags }),
    });
  } catch {
    // Best-effort
  }
}

/**
 * Explicitly remove a note from My Actions (deletes the note_user_actions row).
 */
export async function removeNoteAction(noteId: string): Promise<void> {
  const headers = await getAuthHeaders();
  try {
    await fetch("/api/actions/set", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ note_id: noteId, in_my_actions: false }),
    });
  } catch {
    // Best-effort; caller should optimistically update state before calling.
  }
}

/**
 * Fetch all of the current user's actioned notes, bucketed by urgency.
 * Returns null if unauthenticated or on error.
 */
export async function fetchMyActions(): Promise<MyActionsResult | null> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch("/api/actions/my", { headers });
    if (!res.ok) return null;
    return (await res.json()) as MyActionsResult;
  } catch {
    return null;
  }
}

// ── Saved views ────────────────────────────────────────────────────────────────

export async function fetchSavedViews(): Promise<SavedView[]> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch("/api/actions/views", { headers });
    if (!res.ok) return [];
    return (await res.json()) as SavedView[];
  } catch {
    return [];
  }
}

export async function createSavedView(
  name: string,
  filters: ViewFilters,
): Promise<SavedView | null> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch("/api/actions/views", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name, filters }),
    });
    if (!res.ok) return null;
    return (await res.json()) as SavedView;
  } catch {
    return null;
  }
}

export async function updateSavedView(
  id: string,
  updates: { name?: string; filters?: ViewFilters },
): Promise<boolean> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`/api/actions/views/${id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteSavedView(id: string): Promise<boolean> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`/api/actions/views/${id}`, {
      method: "DELETE",
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}
