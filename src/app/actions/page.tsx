"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { listBoards, type BoardRow } from "@/lib/boards";
import {
  fetchMyActions,
  setNoteAction,
  updateNoteActionTags,
  fetchSavedViews,
  createSavedView,
  deleteSavedView,
  type ActionState,
  type BucketedNote,
  type MyActionsResult,
  type NoteActionMap,
  type ViewFilters,
  type SavedView,
  DEFAULT_FILTERS,
} from "@/lib/userActions";
import { getNote, type NoteRow } from "@/lib/notes";
import { listLabels, type LabelRow } from "@/lib/labels";
import { ActionContext } from "@/lib/ActionContext";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { ActionsBoard } from "@/components/ActionsBoard";
import { SharedTopBar } from "@/components/SharedTopBar";

// Flatten all time-buckets into a single card list.
const BUCKET_KEYS: Array<keyof MyActionsResult> = [
  "overdue", "today", "tomorrow", "this_week", "beyond", "waiting", "done",
];

function flattenResult(result: MyActionsResult): BucketedNote[] {
  const flat: BucketedNote[] = [];
  for (const key of BUCKET_KEYS) {
    for (const note of result[key]) flat.push(note);
  }
  return flat;
}

// ── Client-side filter + sort ─────────────────────────────────────────────────

function applyFilters(cards: BucketedNote[], filters: ViewFilters): BucketedNote[] {
  let result = cards;

  // Search
  const q = filters.search.trim().toLowerCase();
  if (q) {
    result = result.filter((c) => c.content.toLowerCase().includes(q));
  }

  // Categories — note must have ALL selected categories
  if (filters.categories.length > 0) {
    result = result.filter((c) =>
      filters.categories.every((cat) => c.private_tags.includes(cat)),
    );
  }

  // Due filter — only narrows needs_action; waiting/done pass through
  if (filters.dueFilter !== "all") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeekEnd = new Date(today);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

    result = result.filter((c) => {
      if (c.action_state !== "needs_action") return true;
      if (!c.effective_due_date) return false;
      const [y, m, d] = c.effective_due_date.split("-").map(Number);
      const due = new Date(y, m - 1, d);
      switch (filters.dueFilter) {
        case "overdue":   return due < today;
        case "today":     return due.toDateString() === today.toDateString();
        case "this_week": return due >= today && due <= thisWeekEnd;
        default:          return true;
      }
    });
  }

  return result;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [cards, setCards] = useState<BucketedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ActionContext map — keeps CardDetailsModal's "My Action" section in sync.
  const [actionMap, setActionMap] = useState<NoteActionMap>({});

  // Set to true after a successful (authenticated) load so we don't double-fetch.
  const didLoadRef = useRef(false);

  // Filters + saved views
  const [filters, setFilters] = useState<ViewFilters>(DEFAULT_FILTERS);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Modal
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
    setNotFound(false); // clear stale unauth state before each attempt
    const [data, views] = await Promise.all([fetchMyActions(), fetchSavedViews()]);
    if (data === null) {
      setNotFound(true);
    } else {
      didLoadRef.current = true;
      const flat = flattenResult(data);
      setCards(flat);
      // Build action map so CardDetailsModal's "My Action" section reflects truth.
      const map: NoteActionMap = {};
      for (const card of flat) {
        map[card.note_id] = {
          action_state: card.action_state,
          personal_due_date: card.personal_due_date,
          private_tags: card.private_tags,
        };
      }
      setActionMap(map);
    }
    setSavedViews(views);
    setLoading(false);
  }

  useEffect(() => { void loadActions(); }, []);

  // Re-fetch when auth state becomes available (covers the post-magic-link redirect
  // timing gap where getSession() returns null on the initial mount but SIGNED_IN
  // fires shortly after).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !didLoadRef.current) {
        void loadActions();
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtered cards (client-side) ──────────────────────────────────────────

  const filteredCards = useMemo(() => applyFilters(cards, filters), [cards, filters]);

  // All unique categories across all cards (for the filter UI)
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const c of cards) {
      for (const tag of c.private_tags) cats.add(tag);
    }
    return Array.from(cats).sort();
  }, [cards]);

  // ── Drag-to-column → state change ─────────────────────────────────────────

  async function handleStateChange(noteId: string, newState: ActionState) {
    setCards((prev) =>
      prev.map((c) => (c.note_id === noteId ? { ...c, action_state: newState } : c)),
    );
    setActionMap((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], action_state: newState },
    }));
    await setNoteAction(noteId, newState);
  }

  // ── ActionContext handlers ─────────────────────────────────────────────────

  const handleActionChange = useCallback((noteId: string, next: ActionState | "none") => {
    if (next === "none") {
      setCards((prev) => prev.filter((c) => c.note_id !== noteId));
      setActionMap((prev) => {
        const { [noteId]: _removed, ...rest } = prev;
        return rest;
      });
    } else {
      setCards((prev) =>
        prev.map((c) => (c.note_id === noteId ? { ...c, action_state: next } : c)),
      );
      setActionMap((prev) => ({
        ...prev,
        [noteId]: {
          action_state: next,
          personal_due_date: prev[noteId]?.personal_due_date ?? null,
          private_tags: prev[noteId]?.private_tags ?? [],
        },
      }));
    }
    void setNoteAction(noteId, next);
  }, []);

  const handleTagsChange = useCallback((noteId: string, tags: string[]) => {
    // Optimistic: update actionMap and cards immediately
    setActionMap((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], private_tags: tags },
    }));
    setCards((prev) =>
      prev.map((c) => (c.note_id === noteId ? { ...c, private_tags: tags } : c)),
    );
    void updateNoteActionTags(noteId, tags);
  }, []);

  // ── Card click → open modal ────────────────────────────────────────────────

  async function handleOpenCard(noteId: string) {
    const { data: note } = await getNote(noteId);
    if (!note) return;
    const { data: labels } = await listLabels(note.board_id);
    setModalNote(note);
    setModalNoteId(noteId);
    setModalBoardId(note.board_id);
    setModalBoardLabels(labels ?? []);
  }

  function handleCloseModal() {
    setModalNote(null);
    setModalNoteId(null);
  }

  function handleNoteChange(noteId: string, fields: Partial<NoteRow>) {
    if (fields.content !== undefined) {
      setCards((prev) =>
        prev.map((c) => (c.note_id === noteId ? { ...c, content: fields.content! } : c)),
      );
    }
    setModalNote((prev) => (prev ? { ...prev, ...fields } : prev));
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
      // "All" sentinel
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
    // If user changes a filter manually, deactivate the saved view
    setActiveViewId(null);
  }

  const boardHref = boards.length > 0 ? `/board/${boards[0].id}` : "/";

  return (
    <ActionContext.Provider value={{ actionMap, onActionChange: handleActionChange, onTagsChange: handleTagsChange }}>
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
              cards={filteredCards}
              allCategories={allCategories}
              filters={filters}
              savedViews={savedViews}
              activeViewId={activeViewId}
              onStateChange={handleStateChange}
              onOpenCard={handleOpenCard}
              onFiltersChange={handleFiltersChange}
              onSaveView={handleSaveView}
              onLoadView={handleLoadView}
              onDeleteView={handleDeleteView}
            />
          )}
        </div>
      </div>

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
    </ActionContext.Provider>
  );
}
