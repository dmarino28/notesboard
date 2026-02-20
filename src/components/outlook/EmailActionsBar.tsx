"use client";

type Props = {
  subject?: string;
  onCreateFromThread: () => void;
};

export function EmailActionsBar({ subject, onCreateFromThread }: Props) {
  return (
    <div className="flex items-center gap-3 border-b border-white/8 bg-neutral-900/80 px-4 py-2.5">
      <span className="text-sm text-neutral-400">✉️</span>
      <span className="flex-1 truncate text-xs text-neutral-500">
        {subject ?? "Email thread ready"}
      </span>
      <button
        onClick={onCreateFromThread}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700"
      >
        Create card from this thread
      </button>
    </div>
  );
}
