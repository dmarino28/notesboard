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
} from "@/lib/calendar";
import { deleteNote } from "@/lib/notes";
import { CalendarFilterBar } from "@/components/CalendarFilterBar";
import { TimelineGrid } from "@/components/TimelineGrid";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { useToast } from "@/lib/useToast";

// ------------------------------------------------------------------ icons

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9,2 5,7 9,12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="5,2 9,7 5,12" />
    </svg>
  );
}

// ------------------------------------------------------------------ range helpers

type RangeType = "7d" | "30d" | "month";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function computeRangeStart(type: RangeType, anchor: Date): Date {
  const d = startOfDay(anchor);
  if (type === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  return d;
}

function computeRangeEnd(type: RangeType, rs: Date): Date {
  if (type === "7d") return new Date(rs.getTime() + 7 * 86_400_000);
  if (type === "30d") return new Date(rs.getTime() + 30 * 86_400_000);
  return new Date(rs.getFullYear(), rs.getMonth() + 1, 1); // exclusive start of next month
}

function shiftRange(type: RangeType, rs: Date, dir: -1 | 1): Date {
  if (type === "7d") return new Date(rs.getTime() + dir * 7 * 86_400_000);
  if (type === "30d") return new Date(rs.getTime() + dir * 30 * 86_400_000);
  return new Date(rs.getFullYear(), rs.getMonth() + dir, 1);
}

function getDays(rangeStart: Date, rangeEnd: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(rangeStart);
  while (cur < rangeEnd) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatRangeLabel(type: RangeType, rangeStart: Date, rangeEnd: Date): string {
  if (type === "month") {
    return rangeStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const s = rangeStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = new Date(rangeEnd.getTime() - 86_400_000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${s} – ${e}`;
}

// ------------------------------------------------------------------ page

export default function TimelinePage() {
  // data
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [noteLabelMap, setNoteLabelMap] = useState<Record<string, LabelRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // UI
  const [rangeType, setRangeType] = useState<RangeType>("30d");
  const [rangeStart, setRangeStart] = useState<Date>(() =>
    computeRangeStart("30d", new Date()),
  );
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_FILTERS);
  const [modalNoteId, setModalNoteId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // load once
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

  // derived
  const rangeEnd = useMemo(() => computeRangeEnd(rangeType, rangeStart), [rangeType, rangeStart]);
  const days = useMemo(() => getDays(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const boardMap = useMemo(() => Object.fromEntries(boards.map((b) => [b.id, b])), [boards]);
  const filteredNotes = useMemo(
    () => filterNotes(notes, noteLabelMap, filters),
    [notes, noteLabelMap, filters],
  );
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

  // modal callbacks
  const handleNoteChange = useCallback((id: string, fields: Partial<NoteRow>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...fields } : n)));
  }, []);
  const handleLabelCreated = useCallback((label: LabelRow) => {
    setLabels((prev) => [...prev, label]);
  }, []);
  const handleNoteLabelsChanged = useCallback((noteId: string, noteLabels: LabelRow[]) => {
    setNoteLabelMap((prev) => ({ ...prev, [noteId]: noteLabels }));
  }, []);
  const handleError = useCallback((msg: string) => showToast(msg), [showToast]);

  const handleNoteDeleted = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const handleDeleteEverywhere = useCallback(async (noteId: string) => {
    const { error } = await deleteNote(noteId);
    if (error) showToast(`Failed to delete: ${error}`);
    else handleNoteDeleted(noteId);
  }, [handleNoteDeleted, showToast]);

  // range navigation
  function goToday() {
    const rs = computeRangeStart(rangeType, new Date());
    setRangeStart(rs);
  }
  function prev() {
    setRangeStart((rs) => shiftRange(rangeType, rs, -1));
  }
  function next() {
    setRangeStart((rs) => shiftRange(rangeType, rs, 1));
  }
  function switchRangeType(type: RangeType) {
    setRangeType(type);
    setRangeStart(computeRangeStart(type, new Date()));
  }

  // ------------------------------------------------------------------ render

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-page">
        <p className="text-gray-400">Loading timeline…</p>
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

      <div className="mx-auto max-w-[1600px] px-4 py-4">
        {/* Toast */}
        {toast && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {toast}
          </div>
        )}

        {/* Filter bar */}
        <CalendarFilterBar
          boards={boards}
          labels={labels}
          filters={filters}
          onChange={setFilters}
          shownCount={filteredNotes.length}
          totalCount={totalCount}
        />

        {/* Range controls — sticky; overflow-x-auto on mobile to prevent wrapping */}
        <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 overflow-x-auto border-b border-gray-200 bg-page px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Range type selector — matches BoardTopBar segmented control */}
          <div className="flex shrink-0 items-center gap-0.5 rounded-[10px] bg-black/[0.07] p-0.5 ring-1 ring-inset ring-black/[0.04]">
            {(["7d", "30d", "month"] as RangeType[]).map((t) => (
              <button
                key={t}
                onClick={() => switchRangeType(t)}
                className={`rounded-[8px] px-3 py-1 text-xs font-medium transition-all duration-150 ${
                  rangeType === t
                    ? "bg-white text-gray-800 shadow-[0_1px_0_rgba(0,0,0,0.06),0_2px_10px_rgba(0,0,0,0.10)] ring-1 ring-inset ring-black/[0.05]"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t === "7d" ? "7 days" : t === "30d" ? "30 days" : "Month"}
              </button>
            ))}
          </div>

          {/* Prev / Today / Next */}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={prev}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Previous"
            >
              <ChevronLeftIcon />
            </button>
            <button
              onClick={goToday}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
            >
              Today
            </button>
            <button
              onClick={next}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Next"
            >
              <ChevronRightIcon />
            </button>
          </div>

          <span className="shrink-0 text-sm font-semibold text-gray-800">
            {formatRangeLabel(rangeType, rangeStart, rangeEnd)}
          </span>
        </div>

        {/* Timeline */}
        <div className="pt-4">
          <TimelineGrid
            days={days}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            notes={filteredNotes}
            noteLabelMap={noteLabelMap}
            boardMap={boardMap}
            onNoteClick={setModalNoteId}
          />
        </div>
      </div>

      {/* Card modal */}
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
