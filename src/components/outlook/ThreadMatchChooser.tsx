"use client";

import { type OutlookThread } from "@/lib/outlookContext";
import { type ThreadLink } from "@/lib/emailThreads";
import { STATUS_META, STATUS_VALUES, type NoteStatus } from "@/lib/collab";

type Props = {
  thread: OutlookThread | null;
  matches: ThreadLink[];
  onOpenCard: (noteId: string) => void;
  onStartLinking: () => void;
};

export function ThreadMatchChooser({ thread, matches, onOpenCard, onStartLinking }: Props) {
  return (
    <div className="flex h-full flex-col">

      {/* Thread identity header */}
      <div className="flex-shrink-0 border-b border-white/[0.07] px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100">
          {thread?.subject || "(no subject)"}
        </p>
        {thread?.mailbox && (
          <p className="truncate text-xs text-neutral-600">{thread.mailbox}</p>
        )}
      </div>

      {/* Scrollable card list */}
      <div className="nb-scroll flex-1 space-y-2 overflow-y-auto p-4">
        <p className="text-xs text-neutral-500">
          This thread is linked to {matches.length} cards. Open one:
        </p>

        {matches.map((m) => {
          const meta =
            m.status && STATUS_VALUES.includes(m.status as NoteStatus)
              ? STATUS_META[m.status as NoteStatus]
              : null;

          return (
            <button
              key={m.noteId}
              type="button"
              onClick={() => onOpenCard(m.noteId)}
              className="w-full cursor-pointer rounded-xl border border-white/[0.08] bg-neutral-900/70 px-3 py-2.5 text-left transition-colors duration-150 hover:border-white/[0.16] hover:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug text-neutral-100">
                  {m.noteTitle || "(untitled)"}
                </p>
                <span className="mt-0.5 flex-shrink-0 text-neutral-600">→</span>
              </div>
              {(m.boardName || meta) && (
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
                  {m.boardName && <span>{m.boardName}</span>}
                  {m.boardName && meta && <span>·</span>}
                  {meta && (
                    <span className={meta.badgeClass.split(" ")[1]}>{meta.label}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}

        {/* Fallback actions */}
        <div className="space-y-1.5 border-t border-white/[0.06] pt-2">
          <button
            type="button"
            onClick={onStartLinking}
            className="w-full cursor-pointer rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-medium text-neutral-500 transition-colors duration-150 hover:border-white/[0.14] hover:text-neutral-300"
          >
            Link to a different card →
          </button>
        </div>
      </div>

    </div>
  );
}
