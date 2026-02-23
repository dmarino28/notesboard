import { supabase } from "./supabase";

export type ActionState = "needs_action" | "waiting" | "done";
export type ActionMode = "timed" | "flagged";

export type UserActionRow = {
  action_state: ActionState;
  action_mode: ActionMode;
  personal_due_date: string | null;
  private_tags: string[];
};

export type NoteActionMap = Record<string, UserActionRow>;

export type TagDef = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type BucketedNote = {
  note_id: string;
  content: string;
  action_state: ActionState;
  action_mode: ActionMode;
  personal_due_date: string | null;
  effective_due_date: string | null;
  private_tags: string[];
  is_inbox: boolean;
};

export type MyActionsResult = {
  // Timed items bucketed by urgency
  overdue: BucketedNote[];
  today: BucketedNote[];
  tomorrow: BucketedNote[];
  this_week: BucketedNote[];
  beyond: BucketedNote[];
  waiting: BucketedNote[];
  done: BucketedNote[];
  // Flagged items (action_mode = 'flagged'), rendered by group
  flagged: BucketedNote[];
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

// Cycle order for 1-click toggle: none → needs_action → waiting → done → none
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
      action_mode?: ActionMode;
      personal_due_date?: string | null;
      private_tags?: string[];
    };
    if (json.deleted) return null;
    if (json.action_state) {
      return {
        action_state: json.action_state,
        action_mode: json.action_mode ?? "timed",
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
 * Partial update — updates only the provided subset of fields.
 * Does not affect fields that are not included in the patch.
 */
export async function patchNoteAction(
  noteId: string,
  patch: {
    action_mode?: ActionMode;
    personal_due_date?: string | null;
    private_tags?: string[];
  },
): Promise<void> {
  const headers = await getAuthHeaders();
  try {
    await fetch("/api/actions/set", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ note_id: noteId, ...patch }),
    });
  } catch {
    // Best-effort
  }
}

export async function updateNoteActionTags(noteId: string, tags: string[]): Promise<void> {
  return patchNoteAction(noteId, { private_tags: tags });
}

export async function removeNoteAction(noteId: string): Promise<void> {
  const headers = await getAuthHeaders();
  try {
    await fetch("/api/actions/set", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ note_id: noteId, in_my_actions: false }),
    });
  } catch {
    // Best-effort
  }
}

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

// ── Tag definitions ───────────────────────────────────────────────────────────

export async function fetchTagDefs(): Promise<TagDef[]> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch("/api/actions/tags", { headers });
    if (!res.ok) return [];
    return (await res.json()) as TagDef[];
  } catch {
    return [];
  }
}

export async function createTagDef(name: string): Promise<TagDef | null> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch("/api/actions/tags", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TagDef;
  } catch {
    return null;
  }
}

export async function updateTagDef(
  id: string,
  updates: { name?: string; sort_order?: number },
): Promise<TagDef | null> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`/api/actions/tags/${id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return (await res.json()) as TagDef;
  } catch {
    return null;
  }
}

export async function deleteTagDef(id: string): Promise<boolean> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`/api/actions/tags/${id}`, {
      method: "DELETE",
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Quick Action (inbox note) ─────────────────────────────────────────────────

export type QuickActionInput = {
  title: string;
  description?: string;
  action_mode: ActionMode;
  action_state?: ActionState;
  personal_due_date?: string | null;
  private_tags?: string[];
};

export async function createQuickAction(input: QuickActionInput): Promise<string | null> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch("/api/actions/quick", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { note_id: string };
    return json.note_id;
  } catch {
    return null;
  }
}

// ── Saved views ───────────────────────────────────────────────────────────────

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
