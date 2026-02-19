"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { NoteRow } from "@/lib/notes";
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
import { CalendarFilterBar } from "@/components/CalendarFilterBar";
import { TimelineGrid } from "@/components/TimelineGrid";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { useToast } from "@/lib/useToast";

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
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <p className="text-neutral-500">Loading timeline…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <p className="text-red-400">Error: {fetchError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Static page header */}
      <div className="flex items-center gap-4 border-b border-neutral-800 px-6 py-3">
        <Link
          href="/"
          className="text-sm text-neutral-400 transition-colors hover:text-neutral-200"
        >
          ← Boards
        </Link>
        <h1 className="text-base font-semibold text-neutral-100">Global Timeline</h1>
        <Link
          href="/calendar"
          className="ml-auto text-sm text-neutral-400 transition-colors hover:text-neutral-200"
        >
          Calendar →
        </Link>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-4">
        {/* Toast */}
        {toast && (
          <div className="mb-3 rounded-md bg-red-900/80 px-4 py-2 text-sm text-red-200">
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

        {/* Range controls — sticky below the page header */}
        <div className="sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
          {/* Range type selector */}
          <div className="flex items-center gap-0.5 rounded-md border border-neutral-700 p-0.5">
            {(["7d", "30d", "month"] as RangeType[]).map((t) => (
              <button
                key={t}
                onClick={() => switchRangeType(t)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  rangeType === t
                    ? "bg-neutral-200 text-neutral-900"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t === "7d" ? "7 days" : t === "30d" ? "30 days" : "Month"}
              </button>
            ))}
          </div>

          {/* Prev / Today / Next */}
          <div className="flex items-center">
            <button
              onClick={prev}
              className="rounded px-2 py-1 text-base text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              onClick={goToday}
              className="rounded px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              Today
            </button>
            <button
              onClick={next}
              className="rounded px-2 py-1 text-base text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Next"
            >
              ›
            </button>
          </div>

          <span className="text-sm font-medium text-neutral-200">
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
          boardId={modalNote.board_id}
          boardLabels={modalBoardLabels}
          onClose={() => setModalNoteId(null)}
          onNoteChange={handleNoteChange}
          onLabelCreated={handleLabelCreated}
          onNoteLabelsChanged={handleNoteLabelsChanged}
          onError={handleError}
        />
      )}
    </div>
  );
}
