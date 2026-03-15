import { useState, useRef, useCallback, useEffect } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import { detectSignals } from "@/lib/noteSignals";
import { appendPosition, midpointPosition } from "@/lib/noteEntries";
import { tempId, isTemp } from "./tempId";

// ─── Types ────────────────────────────────────────────────────────────────────

type Params = {
  initialEntries: NoteEntryWithSignals[];
  boards: BoardRow[];
  aliasLookup: Map<string, string>;
};

export type UseNotesEntriesReturn = {
  entries: NoteEntryWithSignals[];
  focusedId: string | null;
  saveErrors: Set<string>;
  /**
   * Entries pending archive — all entries that have been backspace-deleted but
   * whose DELETE hasn't fired yet (within the 4-second undo window).
   * Empty array when no undo is available.
   */
  pendingArchives: NoteEntryWithSignals[];
  handleFocus: (id: string) => void;
  handleBlur: (id: string, content: string) => void;
  handleChange: (id: string, content: string) => void;
  handleEnter: (id: string, cursorPos: number) => void;
  handleBackspace: (id: string, isEmpty: boolean) => void;
  handleIndent: (id: string, direction: "in" | "out") => void;
  handleArrow: (id: string, direction: "up" | "down") => void;
  handleAddFirstEntry: () => void;
  handleRetry: (id: string, content: string) => void;
  /** Restore ALL pending archived entries and cancel their deferred DELETEs. */
  handleUndoArchive: () => void;
  /** Called by useOrganize after suggestions are applied to mark entries as applied. */
  markEntriesApplied: (ids: string[]) => void;
  /** Reverse a previous Apply: restore entries to active status in UI + DB. */
  restoreEntries: (ids: string[]) => Promise<void>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotesEntries({
  initialEntries,
  boards,
  aliasLookup,
}: Params): UseNotesEntriesReturn {
  // Synchronously compute initial state so Quick Notes has a focused empty row
  // from the very first paint — no useEffect flash.
  const initRef = useRef<{ entries: NoteEntryWithSignals[]; focusId: string } | null>(null);
  if (initRef.current === null) {
    const today = new Date().toISOString().split("T")[0];
    const todayActive = initialEntries
      .filter((e) => e.entry_date === today && e.status === "active")
      .sort((a, b) => a.position - b.position);
    const lastToday = todayActive[todayActive.length - 1];

    // Reuse an existing empty entry as the terminal only if it has no explicit board context.
    // inferred_board_id is deprecated for terminal-row detection.
    const canReuseLastToday =
      lastToday &&
      lastToday.content === "" &&
      !lastToday.explicit_board_id;

    if (!canReuseLastToday) {
      const base = lastToday ?? initialEntries[initialEntries.length - 1];
      const terminalEntry: NoteEntryWithSignals = {
        id: `tmp-init`,
        user_id: base?.user_id ?? "",
        page_id: base?.page_id ?? null,
        content: "",
        position: appendPosition(initialEntries.map((e) => e.position)),
        indent_level: 0,
        parent_entry_id: null,
        explicit_board_id: null,
        inferred_board_id: null,
        context_source: "unknown",
        entry_date: today,
        meeting_timestamp: null,
        status: "active",
        clip_url: null,
        clip_source: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        signals: [],
      };
      initRef.current = {
        entries: [...initialEntries, terminalEntry],
        focusId: terminalEntry.id,
      };
    } else {
      initRef.current = { entries: initialEntries, focusId: lastToday!.id };
    }
  }

  const [entries, setEntries] = useState<NoteEntryWithSignals[]>(
    () => initRef.current!.entries
  );
  // Ref kept in sync with state so callbacks always see latest entries without stale closures.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const [focusedId, setFocusedId] = useState<string | null>(
    () => initRef.current!.focusId
  );
  // Track entry IDs that failed their last save attempt.
  const [saveErrors, setSaveErrors] = useState<Set<string>>(new Set());

  // Archive undo: all entries that are within the 4-second undo window.
  // Using an array + per-ID timer Map so rapid backspaces don't lose earlier entries.
  const [pendingArchives, setPendingArchives] = useState<NoteEntryWithSignals[]>([]);
  const archiveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Debounce timers for per-entry saves: entry_id → timeout handle
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track temp → real ID mapping to handle post-migration debounce saves
  const tempToRealRef = useRef<Map<string, string>>(new Map());
  // Track temp IDs currently being POSTed to prevent duplicate creation
  const savingTempIds = useRef<Set<string>>(new Set());

  // Confirm focus on initial mount (handles SSR/hydration timing).
  useEffect(() => {
    setFocusedId(initRef.current!.focusId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Signal enrichment ────────────────────────────────────────────────────
  // Enrich an entry with fresh signal detection for visual display ONLY.
  // Routing (explicit_board_id) is intentionally NOT updated here — notes stay
  // in Quick Notes while typing. Routing only happens via the Organize flow.
  const enrichEntry = useCallback(
    (entry: NoteEntryWithSignals): NoteEntryWithSignals => {
      const signals = detectSignals(entry.content, boards, aliasLookup);
      return {
        ...entry,
        signals: signals.map((s) => ({
          id: s.matchStart.toString(),
          entry_id: entry.id,
          signal_type: s.type,
          signal_value: s.value,
          normalized_value: s.normalizedValue ?? null,
          match_text: s.matchText,
          match_start: s.matchStart,
          match_end: s.matchEnd,
          created_at: entry.created_at,
        })),
        // explicit_board_id, inferred_board_id, context_source are preserved as-is.
      };
    },
    [boards, aliasLookup]
  );

  // One-time client-side signal enrichment on mount.
  // DB signals may be missing 'link' type for entries created before the link
  // signal type was added. Re-running enrichEntry ensures [[Board Name]] tokens
  // render correctly after reload without requiring a full page refresh.
  const hasEnrichedRef = useRef(false);
  useEffect(() => {
    if (hasEnrichedRef.current) return;
    hasEnrichedRef.current = true;
    setEntries((prev) => prev.map(enrichEntry));
  }, [enrichEntry]);

  // ─── Persistence ──────────────────────────────────────────────────────────
  // Stable save function. For temp entries: POST to create (tracking inflight to
  // prevent duplicates). For migrated IDs: use the real ID via tempToRealRef.
  const saveEntry = useCallback(async (id: string, content: string) => {
    if (isTemp(id)) {
      // Check if this temp entry was already saved and its ID migrated
      const realId = tempToRealRef.current.get(id);
      if (realId) {
        // ID already migrated — PATCH the real entry with current content
        const res = await fetch(`/api/note-entries/${realId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (res.ok) {
          setSaveErrors((prev) => { const next = new Set(prev); next.delete(id); return next; });
        } else {
          setSaveErrors((prev) => new Set([...prev, id]));
        }
        return;
      }

      // Don't save empty content
      if (!content.trim()) return;
      // Don't double-POST if already in flight
      if (savingTempIds.current.has(id)) return;

      const entry = entriesRef.current.find((e) => e.id === id);
      if (!entry) return;

      savingTempIds.current.add(id);
      try {
        const res = await fetch("/api/note-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            position: entry.position,
            indent_level: entry.indent_level,
            entry_date: entry.entry_date,
            no_auto_route: true, // notes captured here stay in Quick Notes until organized
          }),
        });
        if (res.ok) {
          const { entry: created } = (await res.json()) as { entry: NoteEntryWithSignals };

          // Check for content drift: if the entry's content changed while the POST was in
          // flight (e.g., the user blurred mid-flight causing the debounce to be canceled
          // and saveEntry to be blocked by savingTempIds), capture it now before the state
          // migration so we can fire a follow-up PATCH with the latest content.
          const currentEntry = entriesRef.current.find((e) => e.id === id);
          const latestContent = currentEntry?.content;

          // Record the temp→real mapping before updating state
          tempToRealRef.current.set(id, created.id);
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id
                ? {
                    ...e,
                    id: created.id,
                    signals: created.signals ?? [],
                    // Don't adopt routing fields from server — preserve null
                    explicit_board_id: null,
                    inferred_board_id: null,
                    context_source: "unknown",
                  }
                : e
            )
          );
          setFocusedId((prev) => (prev === id ? created.id : prev));
          setSaveErrors((prev) => { const next = new Set(prev); next.delete(id); return next; });

          // If content drifted during the in-flight POST, persist the latest version.
          if (latestContent !== undefined && latestContent !== content && latestContent.trim()) {
            void fetch(`/api/note-entries/${created.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: latestContent, no_auto_route: true }),
            });
          }
        } else {
          setSaveErrors((prev) => new Set([...prev, id]));
        }
      } finally {
        savingTempIds.current.delete(id);
      }
      return;
    }
    // Real entry — PATCH
    const res = await fetch(`/api/note-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, no_auto_route: true }),
    });
    if (res.ok) {
      setSaveErrors((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } else {
      setSaveErrors((prev) => new Set([...prev, id]));
    }
  }, []);

  const handleRetry = useCallback(
    (id: string, content: string) => {
      // Clear the error optimistically so the UI resets immediately,
      // then re-attempt the save. If it fails again, the error reappears.
      setSaveErrors((prev) => { const next = new Set(prev); next.delete(id); return next; });
      void saveEntry(id, content);
    },
    [saveEntry]
  );

  // ─── Entry event handlers ─────────────────────────────────────────────────

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, []);

  // On blur: immediately flush any pending debounced save so content isn't lost.
  const handleBlur = useCallback(
    (id: string, content: string) => {
      const pendingTimer = saveTimers.current.get(id);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        saveTimers.current.delete(id);
      }
      void saveEntry(id, content);
    },
    [saveEntry]
  );

  const handleChange = useCallback(
    (id: string, content: string) => {
      const prevEntries = entriesRef.current;
      const existingEntry = prevEntries.find((e) => e.id === id);
      const wasEmpty = existingEntry?.content === "";

      // Is this the last entry by date+position (the terminal capture row)?
      const isTerminalEmpty =
        wasEmpty &&
        (() => {
          const sorted = [...prevEntries].sort((a, b) => {
            const dd = a.entry_date.localeCompare(b.entry_date);
            return dd !== 0 ? dd : a.position - b.position;
          });
          return sorted[sorted.length - 1]?.id === id;
        })();

      setEntries((prev) => {
        const updated = prev.map((e) =>
          e.id === id ? enrichEntry({ ...e, content }) : e
        );

        // Auto-append a new empty terminal row when the terminal entry gets its first character.
        if (isTerminalEmpty && content.trim() !== "") {
          const alreadyHasEmptyTerminal = prev
            .filter((e) => e.id !== id && e.status === "active")
            .some((e) => e.content === "");
          if (!alreadyHasEmptyTerminal) {
            const today = new Date().toISOString().split("T")[0];
            const newEntry: NoteEntryWithSignals = {
              id: tempId(),
              user_id: existingEntry!.user_id,
              page_id: existingEntry!.page_id,
              content: "",
              position: appendPosition(prev.map((e) => e.position)),
              indent_level: 0,
              parent_entry_id: null,
              explicit_board_id: null,
              inferred_board_id: null,
              context_source: "unknown",
              entry_date: today,
              meeting_timestamp: null,
              status: "active",
              clip_url: null,
              clip_source: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              signals: [],
            };
            return [...updated, newEntry];
          }
        }

        return updated;
      });

      // Debounced save
      const existingTimer = saveTimers.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        saveTimers.current.delete(id);
        void saveEntry(id, content);
      }, 600);
      saveTimers.current.set(id, timer);
    },
    [enrichEntry, saveEntry]
  );

  const handleEnter = useCallback(
    (id: string, cursorPos: number) => {
      const entries = entriesRef.current;
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;

      const current = entries[idx];
      const before = current.content.slice(0, cursorPos);
      const after = current.content.slice(cursorPos);
      const today = new Date().toISOString().split("T")[0];

      // If pressing Enter at end of line and there's already an empty capture row,
      // just move focus to it — don't create a second empty row.
      if (after === "") {
        // inferred_board_id is deprecated for terminal detection — only explicit routing matters.
        const existingTerminal = entries.find(
          (e) => e.content === "" && !e.explicit_board_id && e.id !== id
        );
        if (existingTerminal) {
          setFocusedId(existingTerminal.id);
          // Still save the current entry
          void (async () => {
            if (isTemp(id)) {
              const pendingTimer = saveTimers.current.get(id);
              if (pendingTimer) {
                clearTimeout(pendingTimer);
                saveTimers.current.delete(id);
              }
              if (before.trim()) {
                await saveEntry(id, before);
              }
            } else {
              await fetch(`/api/note-entries/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: before }),
              });
            }
          })();
          return;
        }
      }

      // Normal Enter: split the current entry into two
      const updatedCurrent = enrichEntry({ ...current, content: before });

      const nextEntry = entries[idx + 1];
      const newPos = nextEntry
        ? midpointPosition(current.position, nextEntry.position)
        : appendPosition(entries.map((e) => e.position));

      const newEntry: NoteEntryWithSignals = enrichEntry({
        id: tempId(),
        user_id: current.user_id,
        page_id: current.page_id,
        content: after,
        position: newPos,
        indent_level: current.indent_level,
        parent_entry_id: null,
        explicit_board_id: null,
        inferred_board_id: null,
        context_source: "unknown",
        entry_date: today,
        meeting_timestamp: null,
        status: "active",
        clip_url: null,
        clip_source: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        signals: [],
      });

      const newEntries = [
        ...entries.slice(0, idx),
        updatedCurrent,
        newEntry,
        ...entries.slice(idx + 1),
      ];
      setEntries(newEntries);
      setFocusedId(newEntry.id);

      void (async () => {
        if (isTemp(id)) {
          // Cancel any pending debounced save for the old temp id
          const pendingTimer = saveTimers.current.get(id);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            saveTimers.current.delete(id);
          }
          if (before.trim()) {
            await saveEntry(id, before);
          }
        } else {
          await fetch(`/api/note-entries/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: before, no_auto_route: true }),
          });
        }

        const res = await fetch("/api/note-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: after,
            position: newPos,
            indent_level: current.indent_level,
            entry_date: today,
            no_auto_route: true,
          }),
        });

        if (res.ok) {
          const { entry } = (await res.json()) as { entry: NoteEntryWithSignals };
          setEntries((prev) =>
            prev.map((e) =>
              e.id === newEntry.id
                ? {
                    ...entry,
                    signals: entry.signals ?? [],
                    explicit_board_id: null,
                    inferred_board_id: null,
                    context_source: "unknown",
                  }
                : e
            )
          );
          setFocusedId(entry.id);
        }
      })();
    },
    [enrichEntry, saveEntry]
  );

  const handleBackspace = useCallback(
    (id: string, isEmpty: boolean) => {
      const entries = entriesRef.current;
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;

      if (isEmpty) {
        const prevEntry = idx > 0 ? entries[idx - 1] : null;
        const toArchive = entries[idx];

        // Cancel any pending debounced save for this entry so it doesn't
        // PATCH an entry that's about to be removed/archived.
        const pendingSave = saveTimers.current.get(id);
        if (pendingSave) {
          clearTimeout(pendingSave);
          saveTimers.current.delete(id);
        }

        setEntries((prev) => prev.filter((e) => e.id !== id));
        if (prevEntry) setFocusedId(prevEntry.id);

        if (!isTemp(id)) {
          // Defer DELETE by 4 s — allows undo. Use a per-ID Map so rapid backspaces
          // on multiple entries each get their own independent timer.
          setPendingArchives((prev) => [...prev, toArchive]);
          const timer = setTimeout(() => {
            archiveTimersRef.current.delete(id);
            void fetch(`/api/note-entries/${id}`, { method: "DELETE" });
            setPendingArchives((prev) => prev.filter((e) => e.id !== id));
          }, 4000);
          // Cancel any pre-existing timer for this ID before registering the new one.
          const existing = archiveTimersRef.current.get(id);
          if (existing) clearTimeout(existing);
          archiveTimersRef.current.set(id, timer);
        }
      } else if (idx > 0) {
        setFocusedId(entries[idx - 1].id);
      }
    },
    []
  );

  const handleUndoArchive = useCallback(() => {
    // Cancel every pending archive timer and restore all entries in one operation.
    archiveTimersRef.current.forEach((timer) => clearTimeout(timer));
    archiveTimersRef.current.clear();

    setEntries((prev) => {
      // Re-insert each pending entry at its original position (by position value).
      let next = [...prev];
      for (const archived of pendingArchives) {
        const insertIdx = next.findIndex((e) => e.position > archived.position);
        if (insertIdx === -1) {
          next.push(archived);
        } else {
          next.splice(insertIdx, 0, archived);
        }
      }
      return next;
    });

    setPendingArchives([]);
  }, [pendingArchives]);

  const handleIndent = useCallback(
    (id: string, direction: "in" | "out") => {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const newLevel =
            direction === "in"
              ? Math.min(8, e.indent_level + 1)
              : Math.max(0, e.indent_level - 1);
          return { ...e, indent_level: newLevel };
        })
      );
      if (!isTemp(id)) {
        const entry = entriesRef.current.find((e) => e.id === id);
        if (!entry) return;
        const newLevel =
          direction === "in"
            ? Math.min(8, entry.indent_level + 1)
            : Math.max(0, entry.indent_level - 1);
        void fetch(`/api/note-entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ indent_level: newLevel }),
        });
      }
    },
    []
  );

  const handleArrow = useCallback(
    (id: string, direction: "up" | "down") => {
      const entries = entriesRef.current;
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;
      const target = direction === "up" ? entries[idx - 1] : entries[idx + 1];
      if (target) setFocusedId(target.id);
    },
    []
  );

  const handleAddFirstEntry = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const newEntry: NoteEntryWithSignals = {
      id: tempId(),
      user_id: "",
      page_id: null,
      content: "",
      position: 1000,
      indent_level: 0,
      parent_entry_id: null,
      explicit_board_id: null,
      inferred_board_id: null,
      context_source: "unknown",
      entry_date: today,
      meeting_timestamp: null,
      status: "active",
      clip_url: null,
      clip_source: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      signals: [],
    };
    setEntries([newEntry]);
    setFocusedId(newEntry.id);
  }, []);

  const markEntriesApplied = useCallback((ids: string[]) => {
    setEntries((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, status: "applied" } : e))
    );
  }, []);

  const restoreEntries = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    // Optimistic: show entries as active immediately.
    setEntries((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, status: "active" } : e))
    );

    // Persist each restore, then roll back any that failed so the UI doesn't
    // falsely imply success for entries that couldn't be un-applied.
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/note-entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        }).then((r) => {
          if (!r.ok) throw new Error(`PATCH ${id} failed: ${r.status}`);
        })
      )
    );

    const failedIds = ids.filter((_, i) => results[i].status === "rejected");
    if (failedIds.length > 0) {
      // Revert the optimistic update for entries that couldn't be restored.
      // The user will still see the successfully restored entries.
      setEntries((prev) =>
        prev.map((e) => (failedIds.includes(e.id) ? { ...e, status: "applied" } : e))
      );
    }
  }, []);

  return {
    entries,
    focusedId,
    saveErrors,
    pendingArchives,
    handleFocus,
    handleBlur,
    handleChange,
    handleEnter,
    handleBackspace,
    handleIndent,
    handleArrow,
    handleAddFirstEntry,
    handleRetry,
    handleUndoArchive,
    markEntriesApplied,
    restoreEntries,
  };
}
