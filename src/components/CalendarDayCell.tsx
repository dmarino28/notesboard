"use client";

import { useEffect, useRef, useState } from "react";
import { DayItem } from "@/lib/calendar";
import { LabelRow } from "@/lib/labels";

type Props = {
  date: Date;
  items: DayItem[];
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
    return "border border-indigo-500/20 bg-indigo-950/50 text-indigo-200 hover:bg-indigo-900/50 hover:border-indigo-500/35";
  }
  if (isOverdue) {
    return "border border-red-500/20 bg-red-950/40 text-red-300 hover:bg-red-950/60 hover:border-red-500/35";
  }
  return "border border-white/[0.07] bg-neutral-900/60 text-neutral-300 hover:bg-neutral-800/70 hover:border-white/[0.13]";
}

export function CalendarDayCell({
  date,
  items,
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
          ? "border-white/[0.06] bg-indigo-500/[0.04] ring-1 ring-inset ring-indigo-500/25"
          : isCurrentMonth
            ? "border-white/[0.06] bg-neutral-950/60"
            : "border-white/[0.04] bg-neutral-900/15"
      }`}
    >
      {/* Day number */}
      <div className="mb-1 flex justify-end pr-0.5">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
            isToday
              ? "bg-indigo-500 text-white"
              : isCurrentMonth
                ? "text-neutral-400"
                : "text-neutral-700"
          }`}
        >
          {date.getDate()}
        </span>
      </div>

      {/* Visible chips */}
      <div className={`space-y-0.5 ${!isCurrentMonth ? "opacity-40" : ""}`}>
        {items
          .slice(0, MAX_VISIBLE)
          .map((item) =>
            renderChip(item, `${item.note.id}-${item.type}`, () => onNoteClick(item.note.id)),
          )}

        {overflow > 0 && (
          <button
            onClick={openPopover}
            className="w-full text-left text-[10px] text-neutral-600 transition-colors hover:text-neutral-400"
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Overflow popover — position:fixed so it escapes the grid's overflow:hidden */}
      {popoverOpen && overflow > 0 && popoverPos && (
        <div
          style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left }}
          className="z-[200] w-52 space-y-1 rounded-xl border border-white/[0.10] bg-neutral-900 p-2 shadow-2xl shadow-black/50"
        >
          <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
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
