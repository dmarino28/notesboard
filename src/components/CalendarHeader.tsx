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
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-neutral-900/40 px-4 py-2.5">
      <h2 className="flex-1 text-sm font-semibold tracking-tight text-neutral-100">{label}</h2>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-white/[0.06] hover:text-neutral-200"
          aria-label="Previous month"
        >
          <ChevronLeftIcon />
        </button>
        <button
          onClick={onNext}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-white/[0.06] hover:text-neutral-200"
          aria-label="Next month"
        >
          <ChevronRightIcon />
        </button>
        <button
          onClick={onToday}
          className="ml-1 rounded-lg border border-white/[0.10] px-3 py-1 text-xs text-neutral-400 transition-colors duration-150 hover:border-white/[0.18] hover:text-neutral-200"
        >
          Today
        </button>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9,2 5,7 9,12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="5,2 9,7 5,12" />
    </svg>
  );
}
