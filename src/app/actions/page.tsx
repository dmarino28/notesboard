"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { listBoards, type BoardRow } from "@/lib/boards";
import {
  fetchMyActions,
  setNoteAction,
  patchNoteAction,
  fetchTagDefs,
  createTagDef,
  fetchSavedViews,
  createSavedView,
  deleteSavedView,
  pollWaiting,
  type ActionState,
  type ActionMode,
  type BucketedNote,
  type MyActionsResult,
  type NoteActionMap,
  type ViewFilters,
  type SavedView,
  type TagDef,
  DEFAULT_FILTERS,
} from "@/lib/userActions";
import { getMsalInstance, GRAPH_MAIL_SCOPE } from "@/lib/msalConfig";
import { getNote, type NoteRow } from "@/lib/notes";
import { listLabels, type LabelRow } from "@/lib/labels";
import { ActionContext } from "@/lib/ActionContext";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { ActionsBoard } from "@/components/ActionsBoard";
import { ManageGroupsModal } from "@/components/ManageGroupsModal";
import { QuickActionModal } from "@/components/QuickActionModal";
import { SharedTopBar } from "@/components/SharedTopBar";

// ── All bucket keys ────────────────────────────────────────────────────────────

const TIMED_BUCKET_KEYS: Array<keyof MyActionsResult> = [
  "overdue", "today", "tomorrow", "this_week", "beyond", "waiting", "done",
];

const ALL_BUCKET_KEYS: Array<keyof MyActionsResult> = [...TIMED_BUCKET_KEYS, "flagged"];

// ── Client-side filter ─────────────────────────────────────────────────────────

function applyFiltersToResult(result: MyActionsResult, filters: ViewFilters): MyActionsResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeekEnd = new Date(today);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

  const q = filters.search.trim().toLowerCase();

  function filterCard(c: BucketedNote): boolean {
    if (q && !c.content.toLowerCase().includes(q)) return false;
    return true;
  }

  function filterTimedCard(c: BucketedNote): boolean {
    if (!filterCard(c)) return false;
    if (filters.categories.length > 0) {
      if (!filters.categories.every((cat) => c.private_tags.includes(cat))) return false;
    }
    if (filters.dueFilter !== "all" && c.action_state === "needs_action") {
      if (!c.effective_due_date) return false;
      const [y, m, d] = c.effective_due_date.split("-").map(Number);
      const due = new Date(y, m - 1, d);
      switch (filters.dueFilter) {
        case "overdue":   return due < today;
        case "today":     return due.toDateString() === today.toDateString();
        case "this_week": return due >= today && due <= thisWeekEnd;
      }
    }
    return true;
  }

  return {
    overdue:    result.overdue.filter(filterTimedCard),
    today:      result.today.filter(filterTimedCard),
    tomorrow:   result.tomorrow.filter(filterTimedCard),
    this_week:  result.this_week.filter(filterTimedCard),
    beyond:     result.beyond.filter(filterTimedCard),
    waiting:    result.waiting.filter(filterTimedCard),
    done:       result.done.filter(filterTimedCard),
    flagged:    result.flagged.filter(filterCard),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [rawResult, setRawResult] = useState<MyActionsResult | null>(null);
  const [tagDefs, setTagDefs] = useState<TagDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ActionContext map
  const [actionMap, setActionMap] = useState<NoteActionMap>({});

  const didLoadRef = useRef(false);

  // Filters + saved views
  const [filters, setFilters] = useState<ViewFilters>(DEFAULT_FILTERS);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Modal dialogs
  const [showQuickAction, setShowQuickAction] = useState(false);
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [checkWaitingBusy, setCheckWaitingBusy] = useState(false);

  // Card detail modal
  const [modalNote, setModalNote] = useState<NoteRow | null>(null);
  const [modalNoteId, setModalNoteId] = useState<string | null>(null);
  const [modalBoardId, setModalBoardId] = useState<string>("");
  const [modalBoardLabels, setModalBoardLabels] = useState<LabelRow[]>([]);

  useEffect(() => {
    listBoards().then(({ data }) => {
      if (data) setBoards(data);
    });
  }, []);

  async function loadActions() {
    setLoading(true);
    setNotFound(false);
    const [data, views, defs] = await Promise.all([
      fetchMyActions(),
      fetchSavedViews(),
      fetchTagDefs(),
    ]);
    if (data === null) {
      setNotFound(true);
    } else {
      didLoadRef.current = true;
      setRawResult(data);
      // Build action map
      const map: NoteActionMap = {};
      for (const key of ALL_BUCKET_KEYS) {
        for (const card of data[key] as BucketedNote[]) {
          map[card.note_id] = {
            action_state: card.action_state,
            action_mode: card.action_mode,
            personal_due_date: card.personal_due_date,
            private_tags: card.private_tags,
          };
        }
      }
      setActionMap(map);
    }
    setSavedViews(views);
    setTagDefs(defs);
    setLoading(false);
  }

  useEffect(() => { void loadActions(); }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !didLoadRef.current) {
        void loadActions();
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtered result (client-side) ──────────────────────────────────────────

  const filteredResult = useMemo(
    () => rawResult ? applyFiltersToResult(rawResult, filters) : null,
    [rawResult, filters],
  );

  // All unique timed categories (for the filter UI)
  const allCategories = useMemo(() => {
    if (!rawResult) return [];
    const cats = new Set<string>();
    for (const key of TIMED_BUCKET_KEYS) {
      for (const c of rawResult[key] as BucketedNote[]) {
        for (const tag of c.private_tags) cats.add(tag);
      }
    }
    return Array.from(cats).sort();
  }, [rawResult]);

  // ── ActionContext handlers ─────────────────────────────────────────────────

  const handleActionChange = useCallback((noteId: string, next: ActionState | "none") => {
    if (next === "none") {
      setRawResult((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        for (const key of ALL_BUCKET_KEYS) {
          updated[key] = (prev[key] as BucketedNote[]).filter((c) => c.note_id !== noteId) as typeof prev[typeof key];
        }
        return updated;
      });
      setActionMap((prev) => {
        const { [noteId]: _removed, ...rest } = prev;
        return rest;
      });
    } else {
      setRawResult((prev) => {
        if (!prev) return prev;
        // Update action_state in whichever bucket the card is currently in
        const updated = { ...prev };
        for (const key of ALL_BUCKET_KEYS) {
          updated[key] = (prev[key] as BucketedNote[]).map((c) =>
            c.note_id === noteId ? { ...c, action_state: next } : c,
          ) as typeof prev[typeof key];
        }
        return updated;
      });
      setActionMap((prev) => ({
        ...prev,
        [noteId]: {
          action_state: next,
          action_mode: prev[noteId]?.action_mode ?? "timed",
          personal_due_date: prev[noteId]?.personal_due_date ?? null,
          private_tags: prev[noteId]?.private_tags ?? [],
        },
      }));
    }
    void setNoteAction(noteId, next);
  }, []);

  const handleTagsChange = useCallback((noteId: string, tags: string[]) => {
    setActionMap((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], private_tags: tags },
    }));
    setRawResult((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const key of ALL_BUCKET_KEYS) {
        updated[key] = (prev[key] as BucketedNote[]).map((c) =>
          c.note_id === noteId ? { ...c, private_tags: tags } : c,
        ) as typeof prev[typeof key];
      }
      return updated;
    });
    void patchNoteAction(noteId, { private_tags: tags });
  }, []);

  const handleModeChange = useCallback((noteId: string, mode: ActionMode) => {
    setActionMap((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], action_mode: mode },
    }));
    void patchNoteAction(noteId, { action_mode: mode }).then(() => void loadActions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDueDateChange = useCallback((noteId: string, date: string | null) => {
    setActionMap((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], personal_due_date: date },
    }));
    setRawResult((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const key of ALL_BUCKET_KEYS) {
        updated[key] = (prev[key] as BucketedNote[]).map((c) =>
          c.note_id === noteId ? { ...c, personal_due_date: date } : c,
        ) as typeof prev[typeof key];
      }
      return updated;
    });
    void patchNoteAction(noteId, { personal_due_date: date });
  }, []);

  const handleCreateTagDef = useCallback(async (name: string): Promise<TagDef | null> => {
    const def = await createTagDef(name);
    if (def) setTagDefs((prev) => [...prev, def]);
    return def;
  }, []);

  // ── Card click → open modal ────────────────────────────────────────────────

  async function handleOpenCard(noteId: string) {
    const { data: note } = await getNote(noteId);
    if (!note) return;
    const bId = (note.board_id as string | null) ?? "";
    const { data: labels } = bId ? await listLabels(bId) : { data: [] };
    setModalNote(note);
    setModalNoteId(noteId);
    setModalBoardId(bId);
    setModalBoardLabels(labels ?? []);
  }

  function handleCloseModal() {
    setModalNote(null);
    setModalNoteId(null);
  }

  function handleNoteChange(noteId: string, fields: Partial<NoteRow>) {
    if (fields.content !== undefined) {
      setRawResult((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        for (const key of ALL_BUCKET_KEYS) {
          updated[key] = (prev[key] as BucketedNote[]).map((c) =>
            c.note_id === noteId ? { ...c, content: fields.content! } : c,
          ) as typeof prev[typeof key];
        }
        return updated;
      });
    }
    setModalNote((prev) => (prev ? { ...prev, ...fields } : prev));
  }

  // ── Quick Action created ───────────────────────────────────────────────────

  function handleQuickActionCreated(_noteId: string) {
    void loadActions();
  }

  // ── Check Waiting ──────────────────────────────────────────────────────────

  async function handlePollWaiting() {
    setCheckWaitingBusy(true);
    try {
      const msal = await getMsalInstance();
      if (!msal) return;

      let accessToken: string;
      try {
        const accounts = msal.getAllAccounts();
        if (accounts.length === 0) throw new Error("no accounts");
        const result = await msal.acquireTokenSilent({ scopes: [GRAPH_MAIL_SCOPE], account: accounts[0] });
        accessToken = result.accessToken;
      } catch {
        const result = await msal.acquireTokenPopup({ scopes: [GRAPH_MAIL_SCOPE] });
        accessToken = result.accessToken;
      }

      const result = await pollWaiting(accessToken);
      if (result && result.updated > 0) {
        void loadActions();
      }
    } catch {
      // User cancelled or popup blocked — silently ignore
    } finally {
      setCheckWaitingBusy(false);
    }
  }

  // ── Saved view handlers ────────────────────────────────────────────────────

  async function handleSaveView(name: string) {
    const view = await createSavedView(name, filters);
    if (view) {
      setSavedViews((prev) => [...prev, view]);
      setActiveViewId(view.id);
    }
  }

  function handleLoadView(view: SavedView) {
    if (!view.id) {
      setFilters(DEFAULT_FILTERS);
      setActiveViewId(null);
      return;
    }
    setFilters({ ...DEFAULT_FILTERS, ...view.filters });
    setActiveViewId(view.id);
  }

  async function handleDeleteView(viewId: string) {
    setSavedViews((prev) => prev.filter((v) => v.id !== viewId));
    if (activeViewId === viewId) {
      setActiveViewId(null);
      setFilters(DEFAULT_FILTERS);
    }
    await deleteSavedView(viewId);
  }

  function handleFiltersChange(f: ViewFilters) {
    setFilters(f);
    setActiveViewId(null);
  }

  const boardHref = boards.length > 0 ? `/board/${boards[0].id}` : "/";

  const EMPTY_RESULT: MyActionsResult = {
    overdue: [], today: [], tomorrow: [], this_week: [], beyond: [], waiting: [], done: [], flagged: [],
  };

  return (
    <ActionContext.Provider
      value={{
        actionMap,
        tagDefs,
        onActionChange: handleActionChange,
        onTagsChange: handleTagsChange,
        onModeChange: handleModeChange,
        onDueDateChange: handleDueDateChange,
        onCreateTagDef: handleCreateTagDef,
      }}
    >
      <div className="flex h-screen flex-col overflow-hidden bg-neutral-950">
        <SharedTopBar boardHref={boardHref} />

        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{ background: "linear-gradient(150deg, #1b1e2e 0%, #13151f 60%, #101218 100%)" }}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-neutral-500">Loading…</p>
            </div>
          ) : notFound ? (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-xl border border-white/[0.07] bg-neutral-900/60 p-6 text-center">
                <p className="text-sm text-neutral-400">Sign in to use My Actions.</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Actions are personal and require authentication.
                </p>
                <Link
                  href="/login"
                  className="mt-3 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  Sign in
                </Link>
              </div>
            </div>
          ) : (
            <ActionsBoard
              result={filteredResult ?? EMPTY_RESULT}
              tagDefs={tagDefs}
              allCategories={allCategories}
              filters={filters}
              savedViews={savedViews}
              activeViewId={activeViewId}
              onOpenCard={handleOpenCard}
              onFiltersChange={handleFiltersChange}
              onSaveView={handleSaveView}
              onLoadView={handleLoadView}
              onDeleteView={handleDeleteView}
              onQuickAction={() => setShowQuickAction(true)}
              onManageGroups={() => setShowManageGroups(true)}
              onCheckWaiting={handlePollWaiting}
              checkWaitingBusy={checkWaitingBusy}
            />
          )}
        </div>
      </div>

      {/* Card detail modal */}
      {modalNote && modalNoteId && (
        <CardDetailsModal
          note={modalNote}
          noteId={modalNoteId}
          boardId={modalBoardId}
          boardLabels={modalBoardLabels}
          onClose={handleCloseModal}
          onNoteChange={handleNoteChange}
          onLabelCreated={(label) => setModalBoardLabels((prev) => [...prev, label])}
          onNoteLabelsChanged={() => {}}
          onError={() => {}}
        />
      )}

      {/* Quick Action modal */}
      {showQuickAction && (
        <QuickActionModal
          tagDefs={tagDefs}
          onCreated={handleQuickActionCreated}
          onClose={() => setShowQuickAction(false)}
        />
      )}

      {/* Manage Groups modal */}
      {showManageGroups && (
        <ManageGroupsModal
          tagDefs={tagDefs}
          onTagDefsChange={setTagDefs}
          onClose={() => setShowManageGroups(false)}
        />
      )}
    </ActionContext.Provider>
  );
}
