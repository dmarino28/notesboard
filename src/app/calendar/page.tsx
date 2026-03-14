"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { NoteRow } from "@/lib/notes";
import { SharedTopBar } from "@/components/SharedTopBar";
import { LabelRow } from "@/lib/labels";
import { BoardRow, listBoards } from "@/lib/boards";
import {
  CalendarFilters,
  DEFAULT_FILTERS,
  listAllNotes,
  listAllLabels,
  listAllNoteLabels,
  filterNotes,
  getUnscheduledNotes,
} from "@/lib/calendar";
import { deleteNote } from "@/lib/notes";
import { CalendarHeader } from "@/components/CalendarHeader";
import { CalendarFilterBar } from "@/components/CalendarFilterBar";
import { CalendarMonthGrid } from "@/components/CalendarMonthGrid";
import { UnscheduledList } from "@/components/UnscheduledList";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { useToast } from "@/lib/useToast";

export default function CalendarPage() {
  // ------------------------------------------------------------------ data state
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [noteLabelMap, setNoteLabelMap] = useState<Record<string, LabelRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ------------------------------------------------------------------ UI state
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [modalNoteId, setModalNoteId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_FILTERS);
  const { toast, showToast } = useToast();

  // ------------------------------------------------------------------ load once on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchError(null);

      const [boardsRes, notesRes, labelsRes, noteLabelsRes] = await Promise.all([
        listBoards(),
        listAllNotes(),
        listAllLabels(),
        listAllNoteLabels(),
      ]);

      if (cancelled) return;

      if (boardsRes.error) {
        setFetchError(boardsRes.error);
        setLoading(false);
        return;
      }
      if (notesRes.error) {
        setFetchError(notesRes.error);
        setLoading(false);
        return;
      }

      setBoards(boardsRes.data);
      setNotes(notesRes.data);
      setLabels(labelsRes.data ?? []);
      setNoteLabelMap(noteLabelsRes.data ?? {});
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------ derived state (memoized)

  const boardMap = useMemo(
    () => Object.fromEntries(boards.map((b) => [b.id, b])),
    [boards],
  );

  const filteredNotes = useMemo(
    () => filterNotes(notes, noteLabelMap, filters),
    [notes, noteLabelMap, filters],
  );

  const unscheduledNotes = useMemo(() => getUnscheduledNotes(filteredNotes), [filteredNotes]);

  const totalCount = useMemo(
    () => notes.filter((n) => filters.showArchived || !n.archived).length,
    [notes, filters.showArchived],
  );

  const modalNote = useMemo(
    () => (modalNoteId ? (notes.find((n) => n.id === modalNoteId) ?? null) : null),
    [modalNoteId, notes],
  );

  const modalBoardLabels = useMemo(
    () => (modalNote ? labels.filter((l) => l.board_id === modalNote.board_id) : []),
    [modalNote, labels],
  );

  // ------------------------------------------------------------------ modal callbacks

  const handleNoteChange = useCallback((id: string, fields: Partial<NoteRow>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...fields } : n)));
  }, []);

  const handleNoteDeleted = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const handleDeleteEverywhere = useCallback(async (noteId: string) => {
    const { error } = await deleteNote(noteId);
    if (error) showToast(`Failed to delete: ${error}`);
    else handleNoteDeleted(noteId);
  }, [handleNoteDeleted, showToast]);

  const handleLabelCreated = useCallback((label: LabelRow) => {
    setLabels((prev) => [...prev, label]);
  }, []);

  const handleNoteLabelsChanged = useCallback((noteId: string, noteLabels: LabelRow[]) => {
    setNoteLabelMap((prev) => ({ ...prev, [noteId]: noteLabels }));
  }, []);

  const handleError = useCallback(
    (msg: string) => {
      showToast(msg);
    },
    [showToast],
  );

  // ------------------------------------------------------------------ month navigation

  function prevMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function goToday() {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  // ------------------------------------------------------------------ render

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-page">
        <p className="text-gray-400">Loading calendar…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex h-screen items-center justify-center bg-page">
        <p className="text-red-500">Error: {fetchError}</p>
      </div>
    );
  }

  const boardHref = boards.length > 0 ? `/board/${boards[0].id}` : "/";

  return (
    <div className="min-h-screen bg-page text-gray-900">
      {/* Shared nav — same segmented control + auth widget as board and actions */}
      <SharedTopBar boardHref={boardHref} />

      <div className="mx-auto max-w-7xl px-4 py-4">
        {/* Toast */}
        {toast && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {toast}
          </div>
        )}

        <CalendarHeader
          currentMonth={currentMonth}
          onPrev={prevMonth}
          onToday={goToday}
          onNext={nextMonth}
        />

        <CalendarFilterBar
          boards={boards}
          labels={labels}
          filters={filters}
          onChange={setFilters}
          shownCount={filteredNotes.length}
          totalCount={totalCount}
        />

        <CalendarMonthGrid
          currentMonth={currentMonth}
          notes={filteredNotes}
          noteLabelMap={noteLabelMap}
          onNoteClick={setModalNoteId}
        />

        <UnscheduledList
          notes={unscheduledNotes}
          boardMap={boardMap}
          noteLabelMap={noteLabelMap}
          onNoteClick={setModalNoteId}
        />
      </div>

      {modalNote && (
        <CardDetailsModal
          note={modalNote}
          noteId={modalNote.id}
          boardId={modalNote.board_id}
          boardLabels={modalBoardLabels}
          onClose={() => setModalNoteId(null)}
          onNoteChange={handleNoteChange}
          onLabelCreated={handleLabelCreated}
          onNoteLabelsChanged={handleNoteLabelsChanged}
          onError={handleError}
          onDeleteEverywhere={handleDeleteEverywhere}
          onNoteDeleted={handleNoteDeleted}
        />
      )}
    </div>
  );
}
