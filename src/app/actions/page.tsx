"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { listBoards, type BoardRow } from "@/lib/boards";
import {
  fetchMyActions,
  setNoteAction,
  cycleActionState,
  type ActionState,
  type BucketedNote,
  type MyActionsResult,
} from "@/lib/userActions";
import { ActionContext } from "@/lib/ActionContext";
import type { NoteActionMap } from "@/lib/userActions";

// ── Top bar (shared nav shape, but standalone — no board management needed) ──

function ActionsTopBar({ boardHref }: { boardHref: string }) {
  const pathname = usePathname();

  const views = [
    { label: "Actions", href: "/actions" },
    { label: "Board", href: boardHref },
    { label: "Calendar", href: "/calendar" },
    { label: "Timeline", href: "/timeline" },
  ];

  return (
    <header className="relative z-10 flex h-[52px] flex-shrink-0 items-center gap-3 border-b border-white/[0.05] bg-neutral-950/60 px-4 shadow-sm shadow-black/20 backdrop-blur-md">
      <span className="text-sm font-semibold tracking-tight text-neutral-100">My Actions</span>

      <nav className="absolute left-1/2 -translate-x-1/2 flex items-center rounded-[10px] bg-white/[0.05] p-0.5">
        {views.map(({ label, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={`rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-neutral-700/80 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_DOT: Record<ActionState | "none", string> = {
  none: "bg-neutral-600",
  needs_action: "bg-orange-500",
  waiting: "bg-sky-500",
  done: "bg-emerald-500",
};

const ACTION_LABEL: Record<ActionState | "none", string> = {
  none: "Mark as needs action",
  needs_action: "Needs action",
  waiting: "Waiting",
  done: "Done",
};

// ── Action card (lightweight, no DnD) ────────────────────────────────────────

function ActionCard({
  note,
  onCycle,
}: {
  note: BucketedNote;
  onCycle: (noteId: string, next: ActionState | "none") => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-neutral-800/60 px-3 py-2.5">
      {/* Cycle button */}
      <button
        type="button"
        onClick={() => onCycle(note.note_id, cycleActionState(note.action_state))}
        title={ACTION_LABEL[note.action_state]}
        className="mt-1 flex-shrink-0"
      >
        <span className={`block h-2.5 w-2.5 rounded-full transition-colors duration-150 ${ACTION_DOT[note.action_state]}`} />
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 text-sm leading-snug text-neutral-100">{note.content}</p>
        {note.effective_due_date && (
          <p className="mt-1 text-[11px] text-neutral-500">
            {note.action_state === "done" ? "Was due" : "Due"}{" "}
            {new Date(note.effective_due_date + "T00:00:00").toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {note.personal_due_date ? " (personal)" : ""}
          </p>
        )}
      </div>
    </li>
  );
}

// ── Bucket section ────────────────────────────────────────────────────────────

const BUCKET_META: Record<
  keyof MyActionsResult,
  { label: string; dotClass: string }
> = {
  overdue:   { label: "Overdue",    dotClass: "bg-red-500" },
  today:     { label: "Today",      dotClass: "bg-orange-500" },
  tomorrow:  { label: "Tomorrow",   dotClass: "bg-amber-500" },
  this_week: { label: "This Week",  dotClass: "bg-yellow-500" },
  beyond:    { label: "Later",      dotClass: "bg-neutral-500" },
  waiting:   { label: "Waiting",    dotClass: "bg-sky-500" },
  done:      { label: "Done",       dotClass: "bg-emerald-500" },
};

const BUCKET_ORDER: Array<keyof MyActionsResult> = [
  "overdue", "today", "tomorrow", "this_week", "beyond", "waiting", "done",
];

function BucketSection({
  bucketKey,
  notes,
  onCycle,
}: {
  bucketKey: keyof MyActionsResult;
  notes: BucketedNote[];
  onCycle: (noteId: string, next: ActionState | "none") => void;
}) {
  if (notes.length === 0) return null;
  const meta = BUCKET_META[bucketKey];

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {meta.label}
        </h2>
        <span className="text-[11px] text-neutral-700">{notes.length}</span>
      </div>
      <ul className="space-y-1.5">
        {notes.map((n) => (
          <ActionCard key={n.note_id} note={n} onCycle={onCycle} />
        ))}
      </ul>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [result, setResult] = useState<MyActionsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ActionContext for the page (actions page manages its own map)
  const [actionMap, setActionMap] = useState<NoteActionMap>({});

  useEffect(() => {
    listBoards().then(({ data }) => {
      if (data) setBoards(data);
    });
  }, []);

  async function loadActions() {
    setLoading(true);
    const data = await fetchMyActions();
    if (data === null) {
      setNotFound(true);
    } else {
      setResult(data);
      // Populate local action map from all buckets
      const map: NoteActionMap = {};
      for (const key of BUCKET_ORDER) {
        for (const note of data[key]) {
          map[note.note_id] = {
            action_state: note.action_state,
            personal_due_date: note.personal_due_date,
          };
        }
      }
      setActionMap(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadActions();
  }, []);

  const boardHref = boards.length > 0 ? `/board/${boards[0].id}` : "/";

  async function handleCycle(noteId: string, next: ActionState | "none") {
    // Optimistic update
    setResult((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const key of BUCKET_ORDER) {
        updated[key] = updated[key].map((n) =>
          n.note_id === noteId ? { ...n, action_state: next === "none" ? n.action_state : next } : n,
        );
        // Remove from bucket if clearing
        if (next === "none") {
          updated[key] = updated[key].filter((n) => n.note_id !== noteId);
        }
      }
      return updated;
    });
    setActionMap((prev) => {
      if (next === "none") {
        const { [noteId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [noteId]: { action_state: next, personal_due_date: prev[noteId]?.personal_due_date ?? null } };
    });
    await setNoteAction(noteId, next);
  }

  // Unused but required by ActionContext shape — onActionChange proxied to handleCycle
  function handleActionChange(noteId: string, next: ActionState | "none") {
    void handleCycle(noteId, next);
  }

  const total = result
    ? BUCKET_ORDER.reduce((acc, k) => acc + result[k].length, 0)
    : 0;

  return (
    <ActionContext.Provider value={{ actionMap, onActionChange: handleActionChange }}>
      <div className="flex h-screen flex-col overflow-hidden bg-neutral-950">
        <ActionsTopBar boardHref={boardHref} />

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ background: "linear-gradient(150deg, #1b1e2e 0%, #13151f 60%, #101218 100%)" }}
        >
          <div className="mx-auto max-w-xl px-6 py-6">
            {loading ? (
              <p className="text-sm text-neutral-500">Loading…</p>
            ) : notFound ? (
              <div className="rounded-xl border border-white/[0.07] bg-neutral-900/60 p-6 text-center">
                <p className="text-sm text-neutral-400">Sign in to use My Actions.</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Actions are personal and require authentication.
                </p>
              </div>
            ) : total === 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-neutral-900/60 p-6 text-center">
                <p className="text-sm text-neutral-400">No actions yet.</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Click the dot on any card to mark it as needs action.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {result &&
                  BUCKET_ORDER.map((key) => (
                    <BucketSection
                      key={key}
                      bucketKey={key}
                      notes={result[key]}
                      onCycle={handleCycle}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ActionContext.Provider>
  );
}
