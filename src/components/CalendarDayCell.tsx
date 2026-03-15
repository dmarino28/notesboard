"use client";

import { useEffect, useRef, useState } from "react";
import { DayItem } from "@/lib/calendar";
import { LabelRow } from "@/lib/labels";
import { BAR_H } from "./CalendarMonthGrid";

type Props = {
  date: Date;
  items: DayItem[];
  /** Number of multi-day bar lanes to reserve above the single-day chips. */
  reservedLanes?: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  noteLabelMap: Record<string, LabelRow[]>;
  onNoteClick: (noteId: string) => void;
};

const MAX_VISIBLE = 3;

function getChipClass(type: DayItem["type"], note: DayItem["note"]): string {
  const isOverdue =
    type === "due" && note.due_date !== null && new Date(note.due_date) < new Date();
  if (type === "event") {
    return "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300";
  }
  if (isOverdue) {
    return "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300";
  }
  return "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300";
}

export function CalendarDayCell({
  date,
  items,
  reservedLanes = 0,
  isCurrentMonth,
  isToday,
  noteLabelMap,
  onNoteClick,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const overflow = items.length - MAX_VISIBLE;

  function openPopover() {
    if (!cellRef.current) return;
    const rect = cellRef.current.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 220),
    });
    setPopoverOpen(true);
  }

  // Close on outside pointer-down
  useEffect(() => {
    if (!popoverOpen) return;
    function handle(e: PointerEvent) {
      if (cellRef.current && !cellRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [popoverOpen]);

  // Close on scroll (popover is fixed and would drift)
  useEffect(() => {
    if (!popoverOpen) return;
    function handleScroll() {
      setPopoverOpen(false);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [popoverOpen]);

  function renderChip(item: DayItem, key: string, onClick: () => void) {
    const labels = noteLabelMap[item.note.id] ?? [];
    return (
      <button
        key={key}
        onClick={onClick}
        title={item.note.content}
        className={`w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] leading-4 transition-all duration-150 ${getChipClass(item.type, item.note)}`}
      >
        {labels.length > 0 && (
          <span
            className="mr-0.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full align-middle"
            style={{ backgroundColor: labels[0].color }}
          />
        )}
        {item.note.content}
      </button>
    );
  }

  return (
    <div
      ref={cellRef}
      className={`relative min-h-[96px] border-b border-r p-1 transition-colors duration-150 ${
        isToday
          ? "border-gray-100 bg-indigo-50/50 ring-1 ring-inset ring-indigo-200/60"
          : isCurrentMonth
            ? "border-gray-100 bg-white"
            : "border-gray-100 bg-gray-50/60"
      }`}
    >
      {/* Day number */}
      <div className="mb-1 flex justify-end pr-0.5">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
            isToday
              ? "bg-indigo-500 text-white"
              : isCurrentMonth
                ? "text-gray-500"
                : "text-gray-300"
          }`}
        >
          {date.getDate()}
        </span>
      </div>

      {/* Spacer that pushes chips below the multi-day bar overlay */}
      {reservedLanes > 0 && (
        <div aria-hidden="true" style={{ height: reservedLanes * BAR_H }} />
      )}

      {/* Visible chips */}
      <div className={`space-y-0.5 ${!isCurrentMonth ? "opacity-50" : ""}`}>
        {items
          .slice(0, MAX_VISIBLE)
          .map((item) =>
            renderChip(item, `${item.note.id}-${item.type}`, () => onNoteClick(item.note.id)),
          )}

        {overflow > 0 && (
          <button
            onClick={openPopover}
            className="w-full text-left text-[10px] text-gray-400 transition-colors hover:text-gray-600"
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Overflow popover — position:fixed so it escapes the grid's overflow:hidden */}
      {popoverOpen && overflow > 0 && popoverPos && (
        <div
          style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left }}
          className="z-[200] w-52 space-y-1 rounded-xl border border-gray-200 bg-white p-2 shadow-elevated"
        >
          <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          {items.slice(MAX_VISIBLE).map((item) =>
            renderChip(item, `pop-${item.note.id}-${item.type}`, () => {
              setPopoverOpen(false);
              onNoteClick(item.note.id);
            }),
          )}
        </div>
      )}
    </div>
  );
}
