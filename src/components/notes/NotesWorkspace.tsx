"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { ViewMode } from "@/lib/noteViews";
import {
  type AliasMap,
  loadUserAliases,
  saveUserAlias,
  buildAliasLookup,
} from "@/lib/noteAliases";
import type { AISuggestion } from "@/lib/ai/noteOrganize";
import { useNotesEntries } from "./useNotesEntries";
import { useOrganize } from "./useOrganize";
import { NotesToolbar } from "./NotesToolbar";
import { NotesEditor } from "./NotesEditor";
import { NotesViewPanel } from "./NotesViewPanel";
import { OrganizePanel } from "./OrganizePanel";
import { BoardSidebar } from "./BoardSidebar";

type Props = {
  initialEntries: NoteEntryWithSignals[];
  boards: BoardRow[];
};

type OrganizeToast = {
  message: string;
  undoIds: string[];
};

export function NotesWorkspace({ initialEntries, boards }: Props) {
  // ─── View + filter state ────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>("all");
  // sidebarFilter drives the primary content filter: "quick" | "all" | boardId
  const [sidebarFilter, setSidebarFilter] = useState<string>("quick");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Alias state ────────────────────────────────────────────────────────────
  const [userAliases, setUserAliases] = useState<AliasMap>(() => loadUserAliases());
  const aliasLookup = useMemo(
    () => buildAliasLookup(boards, userAliases),
    [boards, userAliases]
  );
  const handleConfirmAlias = useCallback((alias: string, boardId: string) => {
    const updated = saveUserAlias(alias, boardId);
    setUserAliases({ ...updated });
  }, []);

  // ─── Entry CRUD + persistence ────────────────────────────────────────────────
  const {
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
  } = useNotesEntries({ initialEntries, boards, aliasLookup });

  // ─── Selection ──────────────────────────────────────────────────────────────
  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Organize toast ──────────────────────────────────────────────────────────
  const [organizeToast, setOrganizeToast] = useState<OrganizeToast | null>(null);
  const organizeToastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSuggestionApplied = useCallback(
    (suggestion: AISuggestion) => {
      const message = `Moved to ${suggestion.targetBoardName}`;
      const undoIds = suggestion.sourceEntryIds;
      setOrganizeToast({ message, undoIds });
      clearTimeout(organizeToastTimerRef.current);
      organizeToastTimerRef.current = setTimeout(() => setOrganizeToast(null), 5000);
    },
    []
  );

  const handleOrganizeToastUndo = useCallback(() => {
    if (!organizeToast) return;
    clearTimeout(organizeToastTimerRef.current);
    void restoreEntries(organizeToast.undoIds);
    setOrganizeToast(null);
  }, [organizeToast, restoreEntries]);

  useEffect(() => {
    return () => clearTimeout(organizeToastTimerRef.current);
  }, []);

  // ─── AI Organize ────────────────────────────────────────────────────────────
  const {
    showOrganize,
    setShowOrganize,
    organizing,
    suggestions,
    handleOrganize,
    handleApplySuggestion,
    handleIgnoreSuggestion,
  } = useOrganize({
    selectedIds,
    onEntriesApplied: markEntriesApplied,
    onSuggestionApplied: handleSuggestionApplied,
  });

  // ─── Stable callbacks for child components ───────────────────────────────────
  const handleSuggestApplied = useCallback(
    (id: string) => markEntriesApplied([id]),
    [markEntriesApplied]
  );
  const handleOrganizeClick = useCallback(
    () => void handleOrganize(),
    [handleOrganize]
  );
  const handleOrganizePanelClose = useCallback(
    () => setShowOrganize(false),
    [setShowOrganize]
  );
  // Archive shortcut: archive a non-empty note via the row's × button.
  // Reuses the same deferred-DELETE + undo system as backspace-on-empty.
  const handleArchive = useCallback(
    (id: string) => handleBackspace(id, true),
    [handleBackspace]
  );

  // ─── Derived display state ───────────────────────────────────────────────────

  const displayEntries = useMemo(() => {
    if (sidebarFilter === "all") return entries;
    if (sidebarFilter === "quick") {
      // Entries only leave Quick Notes when explicitly routed (explicit_board_id set via Organize).
      // Also exclude entries that were applied in this session so the view stays clean without
      // needing a page reload. Post-reload the GET route already excludes them (status !== "active").
      return entries.filter((e) => !e.explicit_board_id && e.status === "active");
    }
    // Board view: show entries explicitly routed here + the terminal capture row.
    return entries.filter(
      (e) =>
        e.explicit_board_id === sidebarFilter ||
        (e.content === "" && !e.explicit_board_id && e.status === "active")
    );
  }, [entries, sidebarFilter]);

  // isEditorView: show the textarea editor when the user is in "all" view with no search.
  // All other view tabs (Signals, Film, Daily, Market) show the read-only NotesViewPanel,
  // regardless of the sidebar selection, so the Signals tab always works.
  const isEditorView = view === "all" && !searchQuery;

  // Active board name — used for the board-specific capture placeholder and context header.
  const activeBoardName = useMemo(() => {
    if (sidebarFilter === "quick" || sidebarFilter === "all") return undefined;
    return boards.find((b) => b.id === sidebarFilter)?.name;
  }, [sidebarFilter, boards]);

  // Organize nudge: count non-empty Quick Notes entries that haven't been explicitly routed.
  // Only shown when the sidebar is in Quick Notes view and there are ≥5 ready to organize.
  const organizeNudgeCount = useMemo(() => {
    if (sidebarFilter !== "quick") return 0;
    return displayEntries.filter(
      (e) => e.content.trim() !== "" && !e.explicit_board_id && e.status === "active"
    ).length;
  }, [displayEntries, sidebarFilter]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NotesToolbar
        view={view}
        onViewChange={setView}
        selectedCount={selectedIds.size}
        onOrganize={handleOrganizeClick}
        organizing={organizing}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar — board navigation */}
        <BoardSidebar
          boards={boards}
          entries={entries}
          selected={sidebarFilter}
          onSelect={setSidebarFilter}
        />

        {/* Main notes area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Board context header — shown when a specific board is selected in the sidebar */}
          {activeBoardName && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Notes
              </span>
              <span className="text-[11px] text-gray-300">—</span>
              <span className="text-[11px] font-semibold text-gray-600">{activeBoardName}</span>
            </div>
          )}

          {/* Organize nudge — shown when ≥5 Quick Notes entries are ready to route */}
          {organizeNudgeCount >= 5 && (
            <button
              type="button"
              onClick={handleOrganizeClick}
              className="mb-4 flex w-full items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/60 px-3.5 py-2 text-left transition-colors hover:bg-indigo-50"
            >
              <span className="text-xs text-indigo-700">
                {organizeNudgeCount} notes ready to organize
              </span>
              <span className="text-xs font-medium text-indigo-600">Organize →</span>
            </button>
          )}

          {/* Archive undo toast */}
          {pendingArchives.length > 0 && (
            <div className="sticky bottom-4 z-10 flex justify-center pointer-events-none mb-2">
              <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-gray-800/90 px-4 py-2 shadow-lg backdrop-blur-sm">
                <span className="text-xs text-gray-300">
                  {pendingArchives.length === 1 ? "Note archived" : `${pendingArchives.length} notes archived`}
                </span>
                <span className="text-gray-600">·</span>
                <button
                  type="button"
                  className="text-xs font-medium text-white hover:text-gray-200"
                  onClick={handleUndoArchive}
                >
                  Undo
                </button>
              </div>
            </div>
          )}

          {/* Organize apply toast — "Moved to [Board] · Undo" */}
          {organizeToast && (
            <div className="sticky bottom-4 z-10 flex justify-center pointer-events-none mb-2">
              <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-indigo-700/90 px-4 py-2 shadow-lg backdrop-blur-sm">
                <span className="text-xs text-indigo-100">{organizeToast.message}</span>
                <span className="text-indigo-400">·</span>
                <button
                  type="button"
                  className="text-xs font-medium text-white hover:text-indigo-200"
                  onClick={handleOrganizeToastUndo}
                >
                  Undo
                </button>
              </div>
            </div>
          )}

          {isEditorView ? (
            <NotesEditor
              entries={displayEntries}
              boards={boards}
              focusedId={focusedId}
              selectedIds={selectedIds}
              saveErrors={saveErrors}
              activeBoardName={activeBoardName}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={handleChange}
              onEnter={handleEnter}
              onBackspace={handleBackspace}
              onIndent={handleIndent}
              onArrow={handleArrow}
              onSelect={handleSelect}
              onAddFirstEntry={handleAddFirstEntry}
              onOrganize={handleOrganizeClick}
              onRetry={handleRetry}
              onSuggestApplied={handleSuggestApplied}
              onArchive={handleArchive}
              userAliases={userAliases}
              onConfirmAlias={handleConfirmAlias}
            />
          ) : (
            <NotesViewPanel
              view={view}
              searchQuery={searchQuery}
              entries={displayEntries}
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

        {/* AI Organize panel */}
        {showOrganize && (
          <div className="w-[380px] flex-shrink-0 border-l border-gray-100 bg-white">
            <OrganizePanel
              suggestions={suggestions}
              onApply={handleApplySuggestion}
              onIgnore={handleIgnoreSuggestion}
              onClose={handleOrganizePanelClose}
              onUndoBatch={restoreEntries}
            />
          </div>
        )}
      </div>
    </div>
  );
}
