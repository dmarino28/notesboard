import { useState, useRef, useCallback } from "react";
import type { AISuggestion } from "@/lib/ai/noteOrganize";
import { isTemp } from "./tempId";

// ─── Types ────────────────────────────────────────────────────────────────────

type Params = {
  /** Current set of selected entry IDs — read via ref inside async callbacks. */
  selectedIds: Set<string>;
  /** Called with the IDs of entries whose suggestions were applied. */
  onEntriesApplied: (ids: string[]) => void;
  /** Called after a suggestion is successfully applied — used to show per-apply toast. */
  onSuggestionApplied?: (suggestion: AISuggestion) => void;
};

export type UseOrganizeReturn = {
  showOrganize: boolean;
  setShowOrganize: React.Dispatch<React.SetStateAction<boolean>>;
  organizing: boolean;
  suggestions: AISuggestion[];
  handleOrganize: () => Promise<void>;
  handleApplySuggestion: (suggestion: AISuggestion) => Promise<void>;
  handleIgnoreSuggestion: (localId: string) => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOrganize({ selectedIds, onEntriesApplied, onSuggestionApplied }: Params): UseOrganizeReturn {
  const [showOrganize, setShowOrganize] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  // Keep refs for values read inside async callbacks to avoid stale closures.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const onEntriesAppliedRef = useRef(onEntriesApplied);
  onEntriesAppliedRef.current = onEntriesApplied;
  const onSuggestionAppliedRef = useRef(onSuggestionApplied);
  onSuggestionAppliedRef.current = onSuggestionApplied;

  const handleOrganize = useCallback(async () => {
    setOrganizing(true);
    setShowOrganize(true);
    try {
      const entryIds =
        selectedIdsRef.current.size > 0
          ? [...selectedIdsRef.current].filter((id) => !isTemp(id))
          : [];
      const res = await fetch("/api/ai/notes-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: entryIds.length > 0 ? entryIds : undefined }),
      });
      if (res.ok) {
        const { suggestions: raw } = (await res.json()) as { suggestions: AISuggestion[] };
        setSuggestions(raw);
      }
    } finally {
      setOrganizing(false);
    }
  }, []);

  const handleApplySuggestion = useCallback(async (suggestion: AISuggestion) => {
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
      if (suggestion.sourceEntryIds.length > 0) {
        onEntriesAppliedRef.current(suggestion.sourceEntryIds);
      }
      onSuggestionAppliedRef.current?.(suggestion);
    }
  }, []);

  const handleIgnoreSuggestion = useCallback((localId: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.localId === localId ? { ...s, status: "ignored" } : s))
    );
  }, []);

  return {
    showOrganize,
    setShowOrganize,
    organizing,
    suggestions,
    handleOrganize,
    handleApplySuggestion,
    handleIgnoreSuggestion,
  };
}
