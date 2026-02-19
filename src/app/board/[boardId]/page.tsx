"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  listNotes,
  createNote,
  deleteNote,
  updateNote,
  reorderNotes,
  type NoteRow,
  type ReorderUpdate,
} from "@/lib/notes";
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
import { useToast } from "@/lib/useToast";
import { Board } from "@/components/Board";
import { ColumnManager } from "@/components/ColumnManager";
import { BoardSelector } from "@/components/BoardSelector";
import { CardDetailsModal } from "@/components/CardDetailsModal";

export default function BoardPage() {
  const params = useParams();
  const boardId = params.boardId as string;
  const router = useRouter();

  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Modal
  const [modalNoteId, setModalNoteId] = useState<string | null>(null);

  // Labels
  const [boardLabels, setBoardLabels] = useState<LabelRow[]>([]);
  const [noteLabelMap, setNoteLabelMap] = useState<Record<string, LabelRow[]>>({});

  const { toast, showToast } = useToast();

  // Load boards list once on mount.
  useEffect(() => {
    listBoards().then(({ data }) => {
      if (data) setBoards(data);
    });
  }, []);

  // Reload columns + notes + labels whenever boardId or showArchived changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setColumns([]);
      setNotes([]);
      setFetchError(null);
      setShowManager(false);
      setModalNoteId(null);

      const [colResult, noteResult, labelResult, labelMapResult] = await Promise.all([
        listColumns(boardId),
        listNotes(boardId, showArchived),
        listLabels(boardId),
        listBoardNoteLabels(boardId),
      ]);

      if (cancelled) return;

      if (colResult.error || noteResult.error) {
        setFetchError(colResult.error ?? noteResult.error);
      } else {
        setColumns(colResult.data);
        setNotes(noteResult.data);
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

  // Notes visible on the board: always filter to archived=false unless showArchived is on.
  // (The fetch already filters server-side, but optimistic archive updates need client filter too.)
  const visibleNotes = showArchived ? notes : notes.filter((n) => !n.archived);

  // Note open for modal (look in full notes state, not just visible)
  const modalNote = modalNoteId ? notes.find((n) => n.id === modalNoteId) ?? null : null;

  // Stable close handler for modal
  const handleCloseModal = useCallback(() => setModalNoteId(null), []);

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

  // --- Note handlers ---

  async function handleAddNote(content: string, columnId: string) {
    const colNotes = notes.filter((n) => n.column_id === columnId);
    const maxPos = colNotes.reduce((max, n) => Math.max(max, n.position), -1);
    const position = maxPos + 1;
    const { error } = await createNote(content, columnId, position, boardId);
    if (error) throw new Error(error);
    const { data } = await listNotes(boardId, showArchived);
    if (data) setNotes(data);
    showToast("Note added");
  }

  async function handleDeleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    const { error } = await deleteNote(id);
    if (error) {
      const { data } = await listNotes(boardId, showArchived);
      if (data) setNotes(data);
      showToast("Failed to delete note");
    } else {
      showToast("Note deleted");
    }
  }

  async function handleUpdateNote(id: string, content: string) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    const { error } = await updateNote(id, content);
    if (error) {
      const { data } = await listNotes(boardId, showArchived);
      if (data) setNotes(data);
      throw new Error(error);
    }
    showToast("Note updated");
  }

  async function handleMoveNote(id: string, columnId: string) {
    const targetColNotes = notes.filter((n) => n.column_id === columnId);
    const maxPos = targetColNotes.reduce((max, n) => Math.max(max, n.position), -1);
    const position = maxPos + 1;
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, column_id: columnId, position } : n)),
    );
    const { error } = await reorderNotes([{ id, column_id: columnId, position }]);
    if (error) {
      const { data } = await listNotes(boardId, showArchived);
      if (data) setNotes(data);
      showToast(`Failed to move note: ${error}`);
    } else {
      showToast("Note moved");
    }
  }

  async function handleReorderNotes(updates: ReorderUpdate[]): Promise<boolean> {
    const updatesMap = new Map(updates.map((u) => [u.id, u]));
    setNotes((prev) => {
      const updated = prev.map((n) => {
        const u = updatesMap.get(n.id);
        return u ? { ...n, column_id: u.column_id, position: u.position } : n;
      });
      return updated.sort((a, b) => {
        const colCmp = a.column_id.localeCompare(b.column_id);
        if (colCmp !== 0) return colCmp;
        return a.position - b.position || a.created_at.localeCompare(b.created_at);
      });
    });

    const { error } = await reorderNotes(updates);

    if (error) {
      const { data } = await listNotes(boardId, showArchived);
      if (data) setNotes(data);
      showToast(`Reorder failed: ${error}`);
      return false;
    }

    showToast("Order saved");
    return true;
  }

  // --- Modal note-change handler (optimistic from modal) ---
  function handleNoteChange(id: string, fields: Partial<NoteRow>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...fields } : n)));
  }

  function handleNoteLabelsChanged(noteId: string, labels: LabelRow[]) {
    setNoteLabelMap((prev) => ({ ...prev, [noteId]: labels }));
  }

  function handleLabelCreated(label: LabelRow) {
    setBoardLabels((prev) => [...prev, label]);
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

    // Only persist rows whose position actually changed
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
    // DB cascade deletes the notes; mirror that in local state.
    setNotes((prev) => prev.filter((n) => n.column_id !== id));
    showToast("Column deleted");
  }

  const currentBoard = boards.find((b) => b.id === boardId);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BoardSelector
              boards={boards}
              currentBoardId={boardId}
              onCreateBoard={handleCreateBoard}
              onRenameBoard={handleRenameBoard}
              onDeleteBoard={handleDeleteBoard}
            />
            {currentBoard && (
              <p className="text-sm text-neutral-400">{currentBoard.name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-400 select-none">
              <input
                type="checkbox"
                className="accent-neutral-400"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            <button
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
              onClick={() => setShowManager((v) => !v)}
            >
              {showManager ? "Close" : "Manage Columns"}
            </button>
          </div>
        </header>

        {toast && (
          <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
            {toast}
          </div>
        )}

        {showManager && (
          <ColumnManager
            columns={columns}
            onAdd={handleAddColumn}
            onRename={handleRenameColumn}
            onUpdateColor={handleUpdateColumnColor}
            onReorder={handleReorderColumns}
            onDelete={handleDeleteColumn}
          />
        )}

        <Board
          key={boardId}
          columns={columns}
          notes={visibleNotes}
          loading={loading}
          error={fetchError}
          noteLabelMap={noteLabelMap}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onUpdateNote={handleUpdateNote}
          onMoveNote={handleMoveNote}
          onReorderNotes={handleReorderNotes}
          onReorderColumns={handleReorderColumns}
          onOpenNote={setModalNoteId}
        />
      </div>

      {modalNote && (
        <CardDetailsModal
          note={modalNote}
          boardId={boardId}
          boardLabels={boardLabels}
          onClose={handleCloseModal}
          onNoteChange={handleNoteChange}
          onLabelCreated={handleLabelCreated}
          onNoteLabelsChanged={handleNoteLabelsChanged}
          onError={showToast}
        />
      )}
    </main>
  );
}
