"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listBoards, type BoardRow } from "@/lib/boards";
import {
  fetchMyActions,
  setNoteAction,
  type ActionState,
  type BucketedNote,
  type MyActionsResult,
  type NoteActionMap,
} from "@/lib/userActions";
import { getNote, type NoteRow } from "@/lib/notes";
import { listLabels, type LabelRow } from "@/lib/labels";
import { ActionContext } from "@/lib/ActionContext";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { ActionsBoard } from "@/components/ActionsBoard";
import { SharedTopBar } from "@/components/SharedTopBar";

// Flatten all time-buckets into a single card list.
// Each BucketedNote already carries action_state, so we don't need bucket keys.
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [cards, setCards] = useState<BucketedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ActionContext map — keeps CardDetailsModal's "My Action" section in sync.
  const [actionMap, setActionMap] = useState<NoteActionMap>({});

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
    const data = await fetchMyActions();
    if (data === null) {
      setNotFound(true);
    } else {
      const flat = flattenResult(data);
      setCards(flat);
      // Build action map so CardDetailsModal's "My Action" section reflects truth.
      const map: NoteActionMap = {};
      for (const card of flat) {
        map[card.note_id] = {
          action_state: card.action_state,
          personal_due_date: card.personal_due_date,
        };
      }
      setActionMap(map);
    }
    setLoading(false);
  }

  useEffect(() => { void loadActions(); }, []);

  // ── Drag-to-column → state change ────────────────────────────────────────────

  async function handleStateChange(noteId: string, newState: ActionState) {
    // Optimistic: move card to new column immediately, persist async.
    setCards((prev) =>
      prev.map((c) => (c.note_id === noteId ? { ...c, action_state: newState } : c)),
    );
    setActionMap((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], action_state: newState },
    }));
    await setNoteAction(noteId, newState);
  }

  // ── ActionContext handler (used by CardDetailsModal's "My Action" section) ───

  const handleActionChange = useCallback((noteId: string, next: ActionState | "none") => {
    if (next === "none") {
      // "None" removes the card from this personal board view entirely.
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
        },
      }));
    }
    void setNoteAction(noteId, next);
  }, []);

  // ── Card click → fetch full note → open modal ─────────────────────────────

  async function handleOpenCard(noteId: string) {
    // Fetch full NoteRow (BucketedNote only has content + due info).
    const { data: note } = await getNote(noteId);
    if (!note) return;
    // Fetch board labels so the modal can show attach/create label UI.
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

  // Sync card content if the user edits the title in the modal.
  function handleNoteChange(noteId: string, fields: Partial<NoteRow>) {
    if (fields.content !== undefined) {
      setCards((prev) =>
        prev.map((c) => (c.note_id === noteId ? { ...c, content: fields.content! } : c)),
      );
    }
    setModalNote((prev) => (prev ? { ...prev, ...fields } : prev));
  }

  const boardHref = boards.length > 0 ? `/board/${boards[0].id}` : "/";

  return (
    <ActionContext.Provider value={{ actionMap, onActionChange: handleActionChange }}>
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
            /* Unauthenticated — same sign-in CTA as before */
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
            /* Board layout — 3 fixed action columns with DnD */
            <ActionsBoard
              cards={cards}
              onStateChange={handleStateChange}
              onOpenCard={handleOpenCard}
            />
          )}
        </div>
      </div>

      {/* Modal — rendered outside the board so z-index is unaffected */}
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
