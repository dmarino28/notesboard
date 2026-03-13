"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { ViewMode } from "@/lib/noteViews";
import type { AISuggestion } from "@/lib/ai/noteOrganize";
import { detectSignals } from "@/lib/noteSignals";
import { inferContextForEntries } from "@/lib/noteContext";
import { appendPosition, midpointPosition } from "@/lib/noteEntries";
import { NotesToolbar } from "./NotesToolbar";
import { NotesEditor } from "./NotesEditor";
import { NotesViewPanel } from "./NotesViewPanel";
import { OrganizePanel } from "./OrganizePanel";

/** Temporary ID prefix for optimistically-created entries before server response. */
const TEMP_PREFIX = "tmp-";

function tempId(): string {
  return `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function isTemp(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

type Props = {
  initialEntries: NoteEntryWithSignals[];
  boards: BoardRow[];
};

export function NotesWorkspace({ initialEntries, boards }: Props) {
  const [entries, setEntries] = useState<NoteEntryWithSignals[]>(initialEntries);
  const [view, setView] = useState<ViewMode>("all");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showOrganize, setShowOrganize] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  // Debounce timers for per-entry saves: entry_id → timeout handle
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ─── Local signal detection ────────────────────────────────────────────────
  // Re-detect signals for an entry's content and update context fields.
  const enrichEntry = useCallback(
    (entry: NoteEntryWithSignals): NoteEntryWithSignals => {
      const signals = detectSignals(entry.content, boards);
      const boardSig = signals.find((s) => s.type === "board");
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
        explicit_board_id: boardSig ? boardSig.value : null,
        context_source: boardSig ? "direct_match" : "unknown",
      };
    },
    [boards]
  );

  // Re-run context inference for all entries whenever entries change.
  const recomputeContext = useCallback(
    (currentEntries: NoteEntryWithSignals[]): NoteEntryWithSignals[] => {
      const sorted = [...currentEntries].sort((a, b) => {
        const dd = a.entry_date.localeCompare(b.entry_date);
        return dd !== 0 ? dd : a.position - b.position;
      });

      const signalMap: Record<string, NoteEntryWithSignals["signals"]> = {};
      for (const e of sorted) signalMap[e.id] = e.signals;

      // Convert to context input format
      const contextInputs = sorted.map((e) => ({
        id: e.id,
        content: e.content,
        position: e.position,
        indent_level: e.indent_level,
        entry_date: e.entry_date,
        explicit_board_id: e.explicit_board_id,
        inferred_board_id: e.inferred_board_id,
        context_source: e.context_source,
      }));

      const withContext = inferContextForEntries(
        contextInputs,
        Object.fromEntries(
          Object.entries(signalMap).map(([id, sigs]) => [
            id,
            sigs.map((s) => ({
              type: s.signal_type as import("@/lib/noteSignals").SignalType,
              value: s.signal_value,
              matchText: s.match_text,
              matchStart: s.match_start ?? 0,
              matchEnd: s.match_end ?? 0,
              normalizedValue: s.normalized_value ?? "",
            })),
          ])
        )
      );

      return sorted.map((e, i) => ({
        ...e,
        explicit_board_id: withContext[i].explicit_board_id,
        inferred_board_id: withContext[i].inferred_board_id,
        context_source: withContext[i].context_source,
      }));
    },
    []
  );

  // ─── Entry event handlers ──────────────────────────────────────────────────

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, []);

  const handleBlur = useCallback(
    (id: string, content: string) => {
      // Trigger save on blur (or let debounce handle it)
    },
    []
  );

  const handleChange = useCallback(
    (id: string, content: string) => {
      setEntries((prev) => {
        const updated = prev.map((e) =>
          e.id === id ? enrichEntry({ ...e, content }) : e
        );
        return recomputeContext(updated);
      });

      // Debounced save
      const existing = saveTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        saveTimers.current.delete(id);
        void saveEntry(id, content);
      }, 600);
      saveTimers.current.set(id, timer);
    },
    [enrichEntry, recomputeContext]
  );

  async function saveEntry(id: string, content: string) {
    if (isTemp(id)) return; // Will be saved on Enter
    await fetch(`/api/note-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  const handleEnter = useCallback(
    (id: string, cursorPos: number) => {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;

      const current = entries[idx];
      const before = current.content.slice(0, cursorPos);
      const after = current.content.slice(cursorPos);
      const today = new Date().toISOString().split("T")[0];

      // Update current entry content (before cursor)
      const updatedCurrent = enrichEntry({ ...current, content: before });

      // Compute new entry position
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
      setEntries(recomputeContext(newEntries));
      setFocusedId(newEntry.id);

      // Save current (trim before cursor) + create new
      void (async () => {
        if (!isTemp(id)) {
          await fetch(`/api/note-entries/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: before }),
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
          }),
        });

        if (res.ok) {
          const { entry } = await res.json() as { entry: NoteEntryWithSignals };
          setEntries((prev) =>
            prev.map((e) => (e.id === newEntry.id ? { ...entry, signals: entry.signals ?? [] } : e))
          );
          setFocusedId(entry.id);
        }
      })();
    },
    [entries, enrichEntry, recomputeContext]
  );

  const handleBackspace = useCallback(
    (id: string, isEmpty: boolean) => {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;

      if (isEmpty) {
        // Delete this entry, focus previous
        const prevEntry = idx > 0 ? entries[idx - 1] : null;
        setEntries((prev) => prev.filter((e) => e.id !== id));
        if (prevEntry) setFocusedId(prevEntry.id);

        if (!isTemp(id)) {
          void fetch(`/api/note-entries/${id}`, { method: "DELETE" });
        }
      }
      // If not empty + cursor at start, just move focus up
      else if (idx > 0) {
        setFocusedId(entries[idx - 1].id);
      }
    },
    [entries]
  );

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
        const entry = entries.find((e) => e.id === id);
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
    [entries]
  );

  const handleArrow = useCallback(
    (id: string, direction: "up" | "down") => {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;
      const target =
        direction === "up" ? entries[idx - 1] : entries[idx + 1];
      if (target) setFocusedId(target.id);
    },
    [entries]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  // ─── AI Organize ──────────────────────────────────────────────────────────

  async function handleOrganize() {
    setOrganizing(true);
    setShowOrganize(true);
    try {
      const entryIds =
        selectedIds.size > 0 ? [...selectedIds].filter((id) => !isTemp(id)) : [];
      const res = await fetch("/api/ai/notes-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: entryIds.length > 0 ? entryIds : undefined }),
      });
      if (res.ok) {
        const { suggestions: raw } = await res.json() as { suggestions: AISuggestion[] };
        setSuggestions(raw);
      }
    } finally {
      setOrganizing(false);
    }
  }

  async function handleApplySuggestion(suggestion: AISuggestion) {
    if (!suggestion.targetBoardId) return;

    const res = await fetch("/api/ai/notes-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: suggestion.type,
        targetBoardId: suggestion.targetBoardId,
        targetColumnId: suggestion.targetColumnId,
        cardContent: suggestion.cardContent,
        cardDescription: suggestion.cardDescription,
        milestoneField: suggestion.milestoneField,
        milestoneValue: suggestion.milestoneValue,
        sourceEntryIds: suggestion.sourceEntryIds,
      }),
    });

    if (res.ok) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.localId === suggestion.localId ? { ...s, status: "applied" } : s
        )
      );
      // Update applied entries' status in local state
      if (suggestion.sourceEntryIds.length > 0) {
        setEntries((prev) =>
          prev.map((e) =>
            suggestion.sourceEntryIds.includes(e.id)
              ? { ...e, status: "applied" }
              : e
          )
        );
      }
    }
  }

  function handleIgnoreSuggestion(localId: string) {
    setSuggestions((prev) =>
      prev.map((s) => (s.localId === localId ? { ...s, status: "ignored" } : s))
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isDefaultView = view === "all" && !searchQuery;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NotesToolbar
        view={view}
        onViewChange={setView}
        selectedCount={selectedIds.size}
        onOrganize={() => void handleOrganize()}
        organizing={organizing}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex min-h-0 flex-1">
        {/* Main notes area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isDefaultView ? (
            <NotesEditor
              entries={entries}
              boards={boards}
              focusedId={focusedId}
              selectedIds={selectedIds}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={handleChange}
              onEnter={handleEnter}
              onBackspace={handleBackspace}
              onIndent={handleIndent}
              onArrow={handleArrow}
              onSelect={handleSelect}
              onAddFirstEntry={handleAddFirstEntry}
            />
          ) : (
            <NotesViewPanel
              view={view}
              searchQuery={searchQuery}
              entries={entries}
              boards={boards}
              focusedId={focusedId}
              selectedIds={selectedIds}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={handleChange}
              onEnter={handleEnter}
              onBackspace={handleBackspace}
              onIndent={handleIndent}
              onArrow={handleArrow}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* AI Organize panel — slide in from right */}
        {showOrganize && (
          <div className="w-[380px] flex-shrink-0 border-l border-gray-100 bg-white">
            <OrganizePanel
              suggestions={suggestions}
              onApply={handleApplySuggestion}
              onIgnore={handleIgnoreSuggestion}
              onClose={() => setShowOrganize(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
