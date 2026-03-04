"use client";

import { useState, useEffect, useRef } from "react";

export type DateRange = { from: Date | null; to: Date | null };

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function sod(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  onClose: () => void;
}

export function DateRangePicker({ value, onChange, onClose }: Props) {
  const today = sod(new Date());
  const initDate = value.from ?? today;
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  // true = waiting for user to pick the end date
  const [pickingEnd, setPickingEnd] = useState(Boolean(value.from && !value.to));
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on outside click (deferred so the opener click doesn't immediately close it)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const id = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleDay(day: Date) {
    if (!value.from || !pickingEnd) {
      onChange({ from: day, to: null });
      setPickingEnd(true);
    } else {
      let from = sod(value.from);
      let to = sod(day);
      if (to < from) [from, to] = [to, from];
      onChange({ from, to });
      setPickingEnd(false);
      onClose();
    }
  }

  // Build the month grid
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const padStart = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(padStart).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const from = value.from ? sod(value.from) : null;
  const to   = value.to   ? sod(value.to)   : null;

  // While picking end, treat hover as the tentative end
  const previewTo = pickingEnd && hoverDate ? sod(hoverDate) : to;

  // Range endpoints (always left ≤ right for highlighting)
  const rangeL = from && previewTo ? (previewTo >= from ? from : previewTo) : from;
  const rangeR = from && previewTo ? (previewTo >= from ? previewTo : from) : to;

  return (
    <div
      ref={containerRef}
      className="w-64 select-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 shadow-2xl"
    >
      {/* Month navigation */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:text-neutral-200"
        >
          ‹
        </button>
        <span className="text-xs font-medium text-neutral-300">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:text-neutral-200"
        >
          ›
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-[10px] text-neutral-700">{d}</span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <span key={idx} className="py-1" />;

          const isFrom      = Boolean(from && sameDay(day, from));
          const isTo        = Boolean(to   && sameDay(day, to));
          const isPreviewTo = Boolean(pickingEnd && hoverDate && sameDay(day, sod(hoverDate)));
          const isEndpoint  = isFrom || isTo || isPreviewTo;
          const inRange     = Boolean(rangeL && rangeR && day > rangeL && day < rangeR);
          const isToday     = sameDay(day, today);

          // Whether this endpoint is alone (single day selection)
          const isSingleRange = Boolean(from && rangeR && sameDay(from, rangeR));
          // Whether this is the left vs right endpoint of a multi-day range
          const isLeft  = isFrom  && !isSingleRange && rangeR && from && from <= rangeR;
          const isRight = (isTo || isPreviewTo) && !isSingleRange;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleDay(day)}
              onMouseEnter={() => setHoverDate(day)}
              onMouseLeave={() => setHoverDate(null)}
              className={[
                "relative py-1 text-[11px] transition-colors",
                inRange ? "bg-indigo-950/60" : "",
                isLeft  ? "rounded-l-full bg-indigo-950/60" : "",
                isRight ? "rounded-r-full bg-indigo-950/60" : "",
                !isEndpoint && isToday  ? "font-medium text-indigo-400" : "",
                !isEndpoint && !isToday ? "text-neutral-500 hover:text-neutral-200" : "",
              ].filter(Boolean).join(" ")}
              style={
                isEndpoint
                  ? {
                      background: "#4f46e5",
                      color: "#fff",
                      fontWeight: 600,
                      borderRadius: isSingleRange
                        ? "9999px"
                        : isLeft
                          ? "9999px 0 0 9999px"
                          : "0 9999px 9999px 0",
                    }
                  : undefined
              }
            >
              {day.getDate()}
              {isToday && !isEndpoint && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-indigo-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2.5 flex items-center justify-between">
        <p className="text-[10px] text-neutral-700">
          {!from ? "Pick a start date" : pickingEnd ? "Pick an end date" : "Range set"}
        </p>
        {from && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-indigo-400 hover:text-indigo-300"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
