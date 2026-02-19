"use client";

type Props = {
  currentMonth: Date;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
};

export function CalendarHeader({ currentMonth, onPrev, onToday, onNext }: Props) {
  const label = currentMonth.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        onClick={onPrev}
        className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        aria-label="Previous month"
      >
        ←
      </button>
      <h2 className="min-w-[11rem] text-center text-lg font-semibold text-neutral-100">{label}</h2>
      <button
        onClick={onNext}
        className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        aria-label="Next month"
      >
        →
      </button>
      <button
        onClick={onToday}
        className="ml-2 rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-white"
      >
        Today
      </button>
    </div>
  );
}
