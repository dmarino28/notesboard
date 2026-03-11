"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  createNote,
  deleteNote,
  updateNote,
  updateNoteFields,
  getNote,
  type NoteRow,
} from "@/lib/notes";
import { bucketKeyForDueDate } from "@/lib/dateUtils";
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
import { SnapshotHeader } from "@/components/SnapshotHeader";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { ActionContext } from "@/lib/ActionContext";
import {
  fetchActionsForNotes,
  setNoteAction,
  patchNoteAction,
  type ActionState,
  type NoteActionMap,
} from "@/lib/userActions";
import { listAwarenessForNotes, markNoteViewed, type AwarenessMap } from "@/lib/awareness";
import { SearchResultsView } from "@/components/SearchResultsView";
import type { SearchResponse, SearchFilters } from "@/lib/search";

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

  // Per-user awareness (last_viewed_at per note, keyed by note_id)
  const [awarenessMap, setAwarenessMap] = useState<AwarenessMap>({});

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Modal for notes opened from search results (may not be on current board)
  const [searchModalNote, setSearchModalNote] = useState<NoteRow | null>(null);
  const [searchModalNoteId, setSearchModalNoteId] = useState<string | null>(null);

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

        // Load email thread indicators, per-user action states, and awareness in parallel
        const noteIds = placementResult.data.map((p) => p.note_id);
        Promise.all([
          listEmailThreadNoteIds(noteIds),
          fetchActionsForNotes(noteIds),
          listAwarenessForNotes(noteIds),
        ]).then(([ids, actionMap, awareness]) => {
          if (!cancelled) {
            setEmailThreadNoteIds(ids);
            setNoteActionMap(actionMap);
            setAwarenessMap(awareness);
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

  // ── Search: debounced effect ─────────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setIsSearchMode(false);
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearchMode(true);
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, filters: searchFilters }),
        });
        if (res.ok) setSearchResults(await res.json());
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchFilters]);

  async function handleOpenSearchCard(noteId: string) {
    const { data: note } = await getNote(noteId);
    if (!note) return;
    setSearchModalNote(note);
    setSearchModalNoteId(noteId);
    // Optimistic awareness: mark as viewed so unseen dot disappears
    setAwarenessMap((prev) => ({ ...prev, [noteId]: { last_viewed_at: new Date().toISOString() } }));
    void markNoteViewed(noteId);
  }

  function handleCloseSearchModal() {
    setSearchModalNote(null);
    setSearchModalNoteId(null);
  }

  // Open a card modal and mark it as viewed (clears unseen dot optimistically).
  const openModal = useCallback((noteId: string) => {
    setModalNoteId(noteId);
    // Optimistic: mark viewed immediately so the dot disappears without a round-trip
    setAwarenessMap((prev) => ({
      ...prev,
      [noteId]: { last_viewed_at: new Date().toISOString() },
    }));
    void markNoteViewed(noteId);
  }, []);

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
      // Refresh placements since copyColumnToBoard creates them
      const { data: pls } = await listPlacements(boardId, showArchived);
      if (pls) setPlacements(pls);
    }

    const targetBoard = boards.find((b) => b.id === targetBoardId);
    showToast(`List copied to "${targetBoard?.name ?? "board"}"`);
  }

  // ── Snapshot Header handlers ──────────────────────────────────────────────

  async function handleBoardUpdate(fields: Partial<BoardRow>) {
    // Optimistic patch on boards list
    setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, ...fields } : b)));
    const { error } = await updateBoard(boardId, fields);
    if (error) {
      // Revert: re-fetch boards
      listBoards().then(({ data }) => { if (data) setBoards(data); });
      showToast("Failed to save snapshot field");
    }
  }

  async function handleHighlightToggle(noteId: string, val: boolean) {
    handleNoteChange(noteId, { highlight_on_snapshot: val });
    const { error } = await updateNoteFields(noteId, { highlight_on_snapshot: val });
    if (error) {
      // Revert
      handleNoteChange(noteId, { highlight_on_snapshot: !val });
      showToast("Failed to update highlight");
    }
  }

  // ── Snapshot derived state (board-scoped, excludes archived) ─────────────
  const currentBoard = boards.find((b) => b.id === boardId);

  const snapshotPlacements = placements.filter((p) => !p.archived);

  const highlightedNotes = snapshotPlacements
    .filter((p) => p.highlight_on_snapshot)
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

  const _snapshotToday = new Date();
  const blockedCount = snapshotPlacements.filter((p) => p.status === "blocked").length;
  const overdueCount = snapshotPlacements.filter(
    (p) =>
      p.due_date !== null &&
      p.status !== "done" &&
      bucketKeyForDueDate(p.due_date, _snapshotToday) === "overdue",
  ).length;

  return (
    <ActionContext.Provider value={{
      actionMap: noteActionMap,
      tagDefs: [],
      awarenessMap,
      onActionChange: handleActionChange,
      onTagsChange: handleTagsChange,
      onModeChange: () => {},
      onDueDateChange: () => {},
      onToggleInActions: () => {},
      onCreateTagDef: async () => null,
    }}>
    <div className="flex h-screen flex-col overflow-hidden bg-[#F4F5F7]">
      <BoardTopBar
        boards={boards}
        boardId={boardId}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        onRenameBoard={handleRenameBoard}
        onCreateBoard={handleCreateBoard}
        onDeleteBoard={handleDeleteBoard}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenNote={openModal}
      />

      {currentBoard?.show_snapshot_header && !isSearchMode && (
        <SnapshotHeader
          board={currentBoard}
          highlightedNotes={highlightedNotes}
          blockedCount={blockedCount}
          overdueCount={overdueCount}
          onBoardUpdate={handleBoardUpdate}
          onHighlightToggle={handleHighlightToggle}
          onOpenNote={openModal}
        />
      )}

      <div className="nb-board-canvas-bg min-h-0 flex-1">
        {isSearchMode ? (
          <SearchResultsView
            query={searchQuery}
            results={searchResults}
            isSearching={isSearching}
            filters={searchFilters}
            boards={boards}
            awarenessMap={awarenessMap}
            onFilterChange={setSearchFilters}
            onOpenCard={handleOpenSearchCard}
          />
        ) : (
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
            onOpenNote={openModal}
            onRenameColumn={handleRenameColumn}
            onDeleteColumn={handleDeleteColumn}
            onUpdateColumnColor={handleUpdateColumnColor}
            onMoveColumnToBoard={handleMoveColumnToBoard}
            onCopyColumnToBoard={handleCopyColumnToBoard}
            onHighlightToggle={handleHighlightToggle}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-elevated">
            {toast}
          </div>
        </div>
      )}

      {/* Board-note modal (current board placements) */}
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

      {/* Search-result modal (cross-board notes fetched on demand) */}
      {searchModalNote && searchModalNoteId && (
        <CardDetailsModal
          note={searchModalNote}
          noteId={searchModalNoteId}
          boardId={(searchModalNote.board_id as string) || boardId}
          boardLabels={boardLabels}
          boards={boards}
          onClose={handleCloseSearchModal}
          onNoteChange={(nid, fields) => {
            handleNoteChange(nid, fields);
            setSearchModalNote((prev) => prev ? { ...prev, ...fields } : prev);
          }}
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
