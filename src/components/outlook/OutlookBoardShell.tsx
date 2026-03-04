"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNote,
  deleteNote,
  updateNote,
  type NoteRow,
} from "@/lib/notes";
import {
  listPlacements,
  createPlacement,
  deletePlacement,
  reorderPlacements,
  maxPlacementPosition,
  type PlacedNoteRow,
  type PlacementReorderUpdate,
} from "@/lib/placements";
import {
  listColumns,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumnPositions,
  type ColumnRow,
} from "@/lib/columns";
import {
  listBoards,
  createBoard,
  updateBoard,
  deleteBoard,
  type BoardRow,
} from "@/lib/boards";
import { listLabels, listBoardNoteLabels, type LabelRow } from "@/lib/labels";
import { listEmailThreadNoteIds } from "@/lib/emailThreads";
import { moveColumnToBoard, copyColumnToBoard } from "@/lib/columnOps";
import { useToast } from "@/lib/useToast";
import { Board } from "@/components/Board";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { EmailActionsBar } from "@/components/outlook/EmailActionsBar";
import { CreateFromThreadSheet } from "@/components/outlook/CreateFromThreadSheet";
import { type OutlookThread } from "@/lib/outlookContext";

const STORAGE_KEY = "outlook_last_board_id";

const DUMMY_THREAD: OutlookThread = {
  conversationId: "dummy-conv-001",
  messageId: "dummy-msg-001",
  webLink: "https://outlook.office365.com/mail/inbox/id/dummy-conv-001",
  subject: "Q1 Planning Discussion",
  provider: "outlook",
  mailbox: "user@example.com",
};

function findLandingPad(boards: BoardRow[]): BoardRow | undefined {
  return boards.find((b) => b.name === "Landing Pad") ?? boards[0];
}

function getInitialBoardId(boards: BoardRow[]): string {
  const stored =
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored && boards.some((b) => b.id === stored)) return stored;
  return findLandingPad(boards)?.id ?? "";
}

type Props = {
  thread?: OutlookThread;
};

export function OutlookBoardShell({ thread }: Props) {
  const activeThread = thread ?? DUMMY_THREAD;

  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [boardId, setBoardId] = useState<string>("");
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [placements, setPlacements] = useState<PlacedNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Modal — keyed on note_id
  const [modalNoteId, setModalNoteId] = useState<string | null>(null);

  // Labels
  const [boardLabels, setBoardLabels] = useState<LabelRow[]>([]);
  const [noteLabelMap, setNoteLabelMap] = useState<Record<string, LabelRow[]>>({});

  // Email thread indicators for card tiles
  const [emailThreadNoteIds, setEmailThreadNoteIds] = useState<Set<string>>(new Set());

  // Create-from-thread sheet
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  // Pending modal note id — set when we switch boards after card creation
  const pendingModalNoteIdRef = useRef<string | null>(null);

  const { toast, showToast } = useToast();

  // Phase 1: Load boards on mount, resolve initial boardId
  useEffect(() => {
    listBoards().then(({ data }) => {
      if (!data || data.length === 0) return;
      setBoards(data);
      const initial = getInitialBoardId(data);
      setBoardId(initial);
    });
  }, []);

  // Phase 2: Reload columns + placements + labels whenever boardId or showArchived changes
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setColumns([]);
      setPlacements([]);
      setFetchError(null);
      setModalNoteId(null);

      const [colResult, placementResult, labelResult, labelMapResult] = await Promise.all([
        listColumns(boardId),
        listPlacements(boardId, showArchived),
        listLabels(boardId),
        listBoardNoteLabels(boardId),
      ]);

      if (cancelled) return;

      if (colResult.error || placementResult.error) {
        setFetchError(colResult.error ?? placementResult.error);
      } else {
        setColumns(colResult.data);
        setPlacements(placementResult.data);

        // Load email thread indicators for card tiles
        const noteIds = placementResult.data.map((p) => p.note_id);
        listEmailThreadNoteIds(noteIds).then((ids) => {
          if (!cancelled) setEmailThreadNoteIds(ids);
        });

        // Auto-open modal if a note was created on a different board we just switched to
        if (pendingModalNoteIdRef.current) {
          const pending = pendingModalNoteIdRef.current;
          pendingModalNoteIdRef.current = null;
          const exists = placementResult.data.some((p) => p.note_id === pending);
          if (exists) setModalNoteId(pending);
        }
      }
      if (!labelResult.error) setBoardLabels(labelResult.data);
      if (!labelMapResult.error) setNoteLabelMap(labelMapResult.data);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [boardId, showArchived]);

  const visiblePlacements = showArchived ? placements : placements.filter((p) => !p.archived);

  const modalPlacement = modalNoteId
    ? placements.find((p) => p.note_id === modalNoteId) ?? null
    : null;

  const handleCloseModal = useCallback(() => setModalNoteId(null), []);

  function handleSelectBoard(id: string) {
    if (id === boardId) return;
    localStorage.setItem(STORAGE_KEY, id);
    setBoardId(id);
  }

  async function handleEmailThreadsChanged() {
    const noteIds = placements.map((p) => p.note_id);
    const ids = await listEmailThreadNoteIds(noteIds);
    setEmailThreadNoteIds(ids);
  }

  // --- Board handlers ---

  async function handleCreateBoard(name: string) {
    const { data, error } = await createBoard(name);
    if (error || !data) {
      showToast("Failed to create board");
      return;
    }
    setBoards((prev) => [...prev, data]);
    handleSelectBoard(data.id);
  }

  async function handleRenameBoard(id: string, name: string) {
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
    const { error } = await updateBoard(id, { name });
    if (error) {
      const { data } = await listBoards();
      if (data) setBoards(data);
      showToast("Failed to rename board");
    }
  }

  async function handleDeleteBoard(id: string) {
    const { error } = await deleteBoard(id);
    if (error) {
      showToast("Failed to delete board");
      return;
    }
    const remaining = boards.filter((b) => b.id !== id);
    setBoards(remaining);
    showToast("Board deleted");

    if (id === boardId) {
      if (remaining.length > 0) {
        handleSelectBoard(remaining[0].id);
      } else {
        const { data: newBoard } = await createBoard("My Board");
        if (newBoard) {
          setBoards([newBoard]);
          handleSelectBoard(newBoard.id);
        }
      }
    }
  }

  // --- Note / placement handlers ---

  async function handleAddNote(content: string, columnId: string) {
    const colPlacements = placements.filter((p) => p.column_id === columnId);
    const maxPos = colPlacements.reduce((max, p) => Math.max(max, p.position), -1);
    const position = maxPos + 1;

    const { data: newNote, error: noteErr } = await createNote(content, columnId, position, boardId);
    if (noteErr || !newNote) throw new Error(noteErr ?? "Failed to create note");

    const { error: placementErr } = await createPlacement({
      noteId: newNote.id,
      boardId,
      columnId,
      position,
    });
    if (placementErr) throw new Error(placementErr);

    const { data } = await listPlacements(boardId, showArchived);
    if (data) setPlacements(data);

    // Auto-open modal for the new card
    setModalNoteId(newNote.id);
    showToast("Note added");
  }

  async function handleRemoveFromBoard(placementId: string) {
    setPlacements((prev) => prev.filter((p) => p.id !== placementId));
    const { error } = await deletePlacement(placementId);
    if (error) {
      const { data } = await listPlacements(boardId, showArchived);
      if (data) setPlacements(data);
      showToast("Failed to remove note");
    } else {
      showToast("Removed from board");
    }
  }

  async function handleDeleteNoteEverywhere(noteId: string) {
    setPlacements((prev) => prev.filter((p) => p.note_id !== noteId));
    const { error } = await deleteNote(noteId);
    if (error) {
      const { data } = await listPlacements(boardId, showArchived);
      if (data) setPlacements(data);
      showToast("Failed to delete note");
    } else {
      showToast("Note deleted everywhere");
    }
  }

  async function handleUpdateNote(noteId: string, content: string) {
    setPlacements((prev) =>
      prev.map((p) => (p.note_id === noteId ? { ...p, content } : p)),
    );
    const { error } = await updateNote(noteId, content);
    if (error) {
      const { data } = await listPlacements(boardId, showArchived);
      if (data) setPlacements(data);
      throw new Error(error);
    }
    showToast("Note updated");
  }

  async function handleReorderPlacements(updates: PlacementReorderUpdate[]): Promise<boolean> {
    const updatesMap = new Map(updates.map((u) => [u.id, u]));
    setPlacements((prev) => {
      const updated = prev.map((p) => {
        const u = updatesMap.get(p.id);
        return u ? { ...p, column_id: u.column_id, position: u.position } : p;
      });
      return updated.sort((a, b) => {
        const colCmp = a.column_id.localeCompare(b.column_id);
        if (colCmp !== 0) return colCmp;
        return a.position - b.position || a.created_at.localeCompare(b.created_at);
      });
    });

    const { error } = await reorderPlacements(updates);

    if (error) {
      const { data } = await listPlacements(boardId, showArchived);
      if (data) setPlacements(data);
      showToast(`Reorder failed: ${error}`);
      return false;
    }

    showToast("Order saved");
    return true;
  }

  function handleNoteChange(noteId: string, fields: Partial<NoteRow>) {
    setPlacements((prev) =>
      prev.map((p) => (p.note_id === noteId ? { ...p, ...fields } : p)),
    );
  }

  function handleNoteLabelsChanged(noteId: string, labels: LabelRow[]) {
    setNoteLabelMap((prev) => ({ ...prev, [noteId]: labels }));
  }

  function handleLabelCreated(label: LabelRow) {
    setBoardLabels((prev) => [...prev, label]);
  }

  async function handleLinkToBoard(
    noteId: string,
    targetBoardId: string,
    targetColumnId: string,
  ) {
    const position = await maxPlacementPosition(targetBoardId, targetColumnId);
    const { error } = await createPlacement({
      noteId,
      boardId: targetBoardId,
      columnId: targetColumnId,
      position: position + 1,
    });
    if (error) throw new Error(error);

    if (targetBoardId === boardId) {
      const { data } = await listPlacements(boardId, showArchived);
      if (data) setPlacements(data);
    }

    const target = boards.find((b) => b.id === targetBoardId);
    showToast(`Linked to "${target?.name ?? "board"}"`);
  }

  // --- Column handlers ---

  async function handleAddColumn(name: string) {
    const { data, error } = await createColumn(boardId, name);
    if (error) {
      showToast("Failed to add column");
      return;
    }
    if (data) setColumns((prev) => [...prev, data]);
    showToast("Column added");
  }

  async function handleRenameColumn(id: string, name: string) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    const { error } = await updateColumn(id, { name });
    if (error) {
      const { data } = await listColumns(boardId);
      if (data) setColumns(data);
      showToast("Failed to rename column");
    } else {
      showToast("Column renamed");
    }
  }

  async function handleUpdateColumnColor(id: string, color: string) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
    const { error } = await updateColumn(id, { color });
    if (error) {
      const { data } = await listColumns(boardId);
      if (data) setColumns(data);
      showToast("Failed to update color");
    }
  }

  async function handleReorderColumns(ids: string[]) {
    const idToCol = Object.fromEntries(columns.map((c) => [c.id, c]));
    const newColumns = ids.map((id, i) => ({ ...idToCol[id], position: i }));
    setColumns(newColumns);

    const updates = newColumns
      .filter((c) => (idToCol[c.id]?.position ?? -1) !== c.position)
      .map((c) => ({ id: c.id, position: c.position }));

    if (updates.length === 0) return;

    const { error } = await reorderColumnPositions(updates);
    if (error) {
      const { data } = await listColumns(boardId);
      if (data) setColumns(data);
      showToast("Failed to reorder columns");
    }
  }

  async function handleDeleteColumn(id: string) {
    const { error } = await deleteColumn(id);
    if (error) {
      showToast("Failed to delete column");
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== id));
    setPlacements((prev) => prev.filter((p) => p.column_id !== id));
    showToast("Column deleted");
  }

  async function handleMoveColumnToBoard(columnId: string, targetBoardId: string) {
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    setPlacements((prev) => prev.filter((p) => p.column_id !== columnId));

    const { error } = await moveColumnToBoard(columnId, targetBoardId, boardId);
    if (error) {
      const [{ data: cols }, { data: pls }] = await Promise.all([
        listColumns(boardId),
        listPlacements(boardId, showArchived),
      ]);
      if (cols) setColumns(cols);
      if (pls) setPlacements(pls);
      showToast("Failed to move list");
      return;
    }
    const targetBoard = boards.find((b) => b.id === targetBoardId);
    showToast(`List moved to "${targetBoard?.name ?? "board"}"`);
  }

  async function handleCopyColumnToBoard(columnId: string, targetBoardId: string) {
    const column = columns.find((c) => c.id === columnId);
    if (!column) return;

    const colPlacements = placements.filter((p) => p.column_id === columnId);
    const colNotes: NoteRow[] = colPlacements.map((p) => ({
      id: p.note_id,
      content: p.content,
      description: p.description,
      due_date: p.due_date,
      event_start: p.event_start,
      event_end: p.event_end,
      archived: p.archived,
      column_id: p.column_id,
      board_id: p.board_id,
      position: p.position,
      created_at: p.created_at,
      status: p.status,
      last_public_activity_at: p.last_public_activity_at,
      last_public_activity_user_id: p.last_public_activity_user_id,
      last_public_activity_type: p.last_public_activity_type,
      last_public_activity_preview: p.last_public_activity_preview,
      updated_at: p.updated_at,
      highlight_on_snapshot: p.highlight_on_snapshot,
      visibility: p.visibility,
      region: p.region,
      created_by: p.created_by,
    }));

    const { data, error } = await copyColumnToBoard(column, colNotes, targetBoardId, noteLabelMap);
    if (error || !data) {
      showToast("Failed to copy list");
      return;
    }

    if (targetBoardId === boardId) {
      setColumns((prev) => [...prev, data.column]);
      const { data: pls } = await listPlacements(boardId, showArchived);
      if (pls) setPlacements(pls);
    }

    const targetBoard = boards.find((b) => b.id === targetBoardId);
    showToast(`List copied to "${targetBoard?.name ?? "board"}"`);
  }

  // --- CreateFromThreadSheet callback ---

  function handleThreadCreated(result: { noteId: string; boardId: string }) {
    setShowCreateSheet(false);
    if (result.boardId === boardId) {
      // Board already loaded — re-fetch placements then open modal
      listPlacements(boardId, showArchived).then(({ data }) => {
        if (data) {
          setPlacements(data);
          setModalNoteId(result.noteId);
        }
      });
    } else {
      // Switch to the board the card was created on; modal opens after load
      pendingModalNoteIdRef.current = result.noteId;
      handleSelectBoard(result.boardId);
    }
  }

  // Landing Pad id for CreateFromThreadSheet
  const landingPadId = findLandingPad(boards)?.id ?? boardId;

  // Sorted boards: Landing Pad first for the header picker
  const sortedBoards = [
    ...boards.filter((b) => b.name === "Landing Pad"),
    ...boards.filter((b) => b.name !== "Landing Pad"),
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950">
      {/* Compact header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/8 bg-neutral-900/80 px-4 py-2.5">
        <span className="text-sm font-semibold text-neutral-200">NotesBoard</span>
        <span className="text-neutral-600">✉</span>
        <select
          className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-500"
          value={boardId}
          onChange={(e) => handleSelectBoard(e.target.value)}
        >
          {sortedBoards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name === "Landing Pad" ? `${b.name} ★` : b.name}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-500">
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Archived
        </label>
      </div>

      {/* Email actions bar — shows real subject when provided */}
      <EmailActionsBar
        subject={activeThread.subject}
        onCreateFromThread={() => setShowCreateSheet(true)}
      />

      <div
        className="min-h-0 flex-1"
        style={{ background: "linear-gradient(150deg, #1b1e2e 0%, #13151f 60%, #101218 100%)" }}
      >
        {boardId && (
          <Board
            key={boardId}
            columns={columns}
            notes={visiblePlacements}
            loading={loading}
            error={fetchError}
            noteLabelMap={noteLabelMap}
            emailThreadNoteIds={emailThreadNoteIds}
            boards={boards}
            currentBoardId={boardId}
            onAddNote={handleAddNote}
            onRemoveNote={handleRemoveFromBoard}
            onUpdateNote={handleUpdateNote}
            onReorderNotes={handleReorderPlacements}
            onReorderColumns={handleReorderColumns}
            onAddColumn={handleAddColumn}
            onOpenNote={setModalNoteId}
            onRenameColumn={handleRenameColumn}
            onDeleteColumn={handleDeleteColumn}
            onUpdateColumnColor={handleUpdateColumnColor}
            onMoveColumnToBoard={handleMoveColumnToBoard}
            onCopyColumnToBoard={handleCopyColumnToBoard}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 shadow-xl">
            {toast}
          </div>
        </div>
      )}

      {/* Card details modal */}
      {modalPlacement && (
        <CardDetailsModal
          note={modalPlacement}
          noteId={modalPlacement.note_id}
          boardId={boardId}
          boardLabels={boardLabels}
          boards={boards}
          onClose={handleCloseModal}
          onNoteChange={handleNoteChange}
          onLabelCreated={handleLabelCreated}
          onNoteLabelsChanged={handleNoteLabelsChanged}
          onError={showToast}
          onDeleteEverywhere={handleDeleteNoteEverywhere}
          onLinkToBoard={handleLinkToBoard}
          onEmailThreadsChanged={handleEmailThreadsChanged}
        />
      )}

      {/* Create-from-thread sheet */}
      {showCreateSheet && boards.length > 0 && (
        <CreateFromThreadSheet
          thread={activeThread}
          boards={boards}
          landingPadBoardId={landingPadId}
          onCreated={handleThreadCreated}
          onCancel={() => setShowCreateSheet(false)}
        />
      )}
    </div>
  );
}
