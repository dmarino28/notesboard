"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { BoardTopBar } from "@/components/BoardTopBar";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { ActionContext } from "@/lib/ActionContext";
import {
  fetchActionsForNotes,
  setNoteAction,
  patchNoteAction,
  type ActionState,
  type NoteActionMap,
} from "@/lib/userActions";

export default function BoardPage() {
  const params = useParams();
  const boardId = params.boardId as string;
  const router = useRouter();

  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [placements, setPlacements] = useState<PlacedNoteRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
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

  // Per-user action states (keyed by note_id, invisible to other users)
  const [noteActionMap, setNoteActionMap] = useState<NoteActionMap>({});

  const { toast, showToast } = useToast();

  // Load boards list once on mount.
  useEffect(() => {
    listBoards().then(({ data }) => {
      if (data) setBoards(data);
    });
  }, []);

  // Reload columns + placements + labels whenever boardId or showArchived changes.
  useEffect(() => {
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

        // Load email thread indicators + per-user action states in parallel
        const noteIds = placementResult.data.map((p) => p.note_id);
        Promise.all([
          listEmailThreadNoteIds(noteIds),
          fetchActionsForNotes(noteIds),
        ]).then(([ids, actionMap]) => {
          if (!cancelled) {
            setEmailThreadNoteIds(ids);
            setNoteActionMap(actionMap);
          }
        });
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

  // Visible placements: always filter archived unless showArchived is on.
  const visiblePlacements = showArchived ? placements : placements.filter((p) => !p.archived);

  // Modal note — look up by note_id (any matching placement has the same content)
  const modalPlacement = modalNoteId
    ? placements.find((p) => p.note_id === modalNoteId) ?? null
    : null;

  const handleCloseModal = useCallback(() => setModalNoteId(null), []);

  // Cycle a note's personal action state (optimistic + async persist).
  async function handleActionChange(noteId: string, next: ActionState | "none") {
    setNoteActionMap((prev) => {
      if (next === "none") {
        const { [noteId]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [noteId]: {
          action_state: next,
          action_mode: prev[noteId]?.action_mode ?? "timed",
          is_in_actions: prev[noteId]?.is_in_actions ?? true,
          private_tags: prev[noteId]?.private_tags ?? [],
        },
      };
    });
    await setNoteAction(noteId, next);
  }

  // Update private categories for a note's action row (optimistic + async persist).
  function handleTagsChange(noteId: string, tags: string[]) {
    setNoteActionMap((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], private_tags: tags },
    }));
    void patchNoteAction(noteId, { private_tags: tags });
  }

  // Refresh email thread indicators after a thread is linked/unlinked in the modal.
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
    router.push(`/board/${data.id}`);
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
        router.push(`/board/${remaining[0].id}`);
      } else {
        const { data: newBoard } = await createBoard("My Board");
        if (newBoard) {
          setBoards([newBoard]);
          router.push(`/board/${newBoard.id}`);
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
    // Optimistic: remove all placements for this note from current board
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
    // Update all placements of this note in local state
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

  // Called by CardDetailsModal when note content/fields change.
  // Updates all placements for this note_id in local state.
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

  // Link a note to another board.
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

    // If linking to current board, refresh placements
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
    // Placements for deleted column's notes cascade via DB (column → note_placements ON DELETE CASCADE for column_id)
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

    // Build NoteRow-compatible objects from placements in this column
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
      last_public_activity_type: p.last_public_activity_type,
      last_public_activity_preview: p.last_public_activity_preview,
    }));

    const { data, error } = await copyColumnToBoard(column, colNotes, targetBoardId, noteLabelMap);
    if (error || !data) {
      showToast("Failed to copy list");
      return;
    }

    if (targetBoardId === boardId) {
      setColumns((prev) => [...prev, data.column]);
      // Refresh placements since copyColumnToBoard creates them
      const { data: pls } = await listPlacements(boardId, showArchived);
      if (pls) setPlacements(pls);
    }

    const targetBoard = boards.find((b) => b.id === targetBoardId);
    showToast(`List copied to "${targetBoard?.name ?? "board"}"`);
  }

  const currentBoard = boards.find((b) => b.id === boardId);

  return (
    <ActionContext.Provider value={{
      actionMap: noteActionMap,
      tagDefs: [],
      onActionChange: handleActionChange,
      onTagsChange: handleTagsChange,
      onModeChange: () => {},
      onDueDateChange: () => {},
      onToggleInActions: () => {},
      onCreateTagDef: async () => null,
    }}>
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950">
      <BoardTopBar
        boards={boards}
        boardId={boardId}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        onRenameBoard={handleRenameBoard}
        onCreateBoard={handleCreateBoard}
        onDeleteBoard={handleDeleteBoard}
      />

      <div
        className="min-h-0 flex-1"
        style={{ background: "linear-gradient(150deg, #1b1e2e 0%, #13151f 60%, #101218 100%)" }}
      >
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
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 shadow-xl">
            {toast}
          </div>
        </div>
      )}

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
    </div>
    </ActionContext.Provider>
  );
}
