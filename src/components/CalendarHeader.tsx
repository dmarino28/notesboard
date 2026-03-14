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
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
      <h2 className="flex-1 text-sm font-semibold tracking-tight text-gray-900">{label}</h2>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Previous month"
        >
          <ChevronLeftIcon />
        </button>
        <button
          onClick={onNext}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Next month"
        >
          <ChevronRightIcon />
        </button>
        <button
          onClick={onToday}
          className="ml-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 transition-colors duration-150 hover:border-gray-300 hover:text-gray-700"
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
