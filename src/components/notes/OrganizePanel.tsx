"use client";

import { useState } from "react";
import type { AISuggestion } from "@/lib/ai/noteOrganize";

type Props = {
  suggestions: AISuggestion[];
  onApply: (suggestion: AISuggestion) => Promise<void>;
  onIgnore: (localId: string) => void;
  onClose: () => void;
};

const CONFIDENCE_STYLES = {
  high: "bg-green-50 text-green-700 border-green-200",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  low: "bg-gray-50 text-gray-500 border-gray-200",
};

const TYPE_LABELS: Record<AISuggestion["type"], string> = {
  create_card: "Create card",
  update_card: "Update card",
  update_board_metadata: "Update board",
  add_milestone: "Add milestone",
  attach_note_reference: "Link reference",
};

const TYPE_ICONS: Record<AISuggestion["type"], string> = {
  create_card: "+",
  update_card: "↑",
  update_board_metadata: "◈",
  add_milestone: "◎",
  attach_note_reference: "↗",
};

export function OrganizePanel({ suggestions, onApply, onIgnore, onClose }: Props) {
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [confirmApplyAll, setConfirmApplyAll] = useState(false);

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const appliedSuggestions = suggestions.filter((s) => s.status === "applied");

  async function handleApply(suggestion: AISuggestion) {
    setApplyingId(suggestion.localId);
    try {
      await onApply(suggestion);
    } finally {
      setApplyingId(null);
    }
  }

  async function handleApplyAll() {
    if (!confirmApplyAll) {
      setConfirmApplyAll(true);
      // Auto-reset after 3 s if user doesn't confirm
      setTimeout(() => setConfirmApplyAll(false), 3000);
      return;
    }
    setConfirmApplyAll(false);
    setApplyingAll(true);
    try {
      for (const s of pendingSuggestions) {
        await onApply(s);
      }
    } finally {
      setApplyingAll(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">✦ Organize Notes</h2>
          <p className="text-xs text-gray-500">
            Review AI suggestions before applying. Nothing changes until you confirm.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="nb-scroll flex-1 overflow-y-auto px-4 py-3">
        {suggestions.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">
            No suggestions generated. Try selecting specific entries and organizing again.
          </div>
        )}

        {pendingSuggestions.length > 0 && (
          <div className="space-y-3">
            {pendingSuggestions.map((s) => (
              <SuggestionCard
                key={s.localId}
                suggestion={s}
                isApplying={applyingId === s.localId}
                onApply={() => void handleApply(s)}
                onIgnore={() => onIgnore(s.localId)}
              />
            ))}
          </div>
        )}

        {appliedSuggestions.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-400">Applied</p>
            <div className="space-y-2">
              {appliedSuggestions.map((s) => (
                <div
                  key={s.localId}
                  className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2"
                >
                  <span className="text-xs font-medium text-green-600">✓</span>
                  <span className="text-xs text-green-700">{s.targetBoardName} — {s.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Apply Selected */}
      {pendingSuggestions.length > 1 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={() => void handleApplyAll()}
            disabled={applyingAll}
            className={`w-full rounded-lg py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
              confirmApplyAll
                ? "bg-orange-500 hover:bg-orange-400"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {applyingAll
              ? "Applying…"
              : confirmApplyAll
              ? `Confirm? Apply all ${pendingSuggestions.length}`
              : `Apply All (${pendingSuggestions.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  isApplying,
  onApply,
  onIgnore,
}: {
  suggestion: AISuggestion;
  isApplying: boolean;
  onApply: () => void;
  onIgnore: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const confidenceStyle = CONFIDENCE_STYLES[suggestion.confidence];
  const typeLabel = TYPE_LABELS[suggestion.type];
  const typeIcon = TYPE_ICONS[suggestion.type];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-start gap-3 px-3 pt-3">
        {/* Type badge */}
        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-indigo-50 text-xs font-semibold text-indigo-600">
          {typeIcon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-700">{suggestion.targetBoardName}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">{typeLabel}</span>
            {suggestion.targetColumnName && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500">{suggestion.targetColumnName}</span>
              </>
            )}
            <span className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] font-medium ${confidenceStyle}`}>
              {suggestion.confidence}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-800">{suggestion.description}</p>
        </div>
      </div>

      {/* Expandable detail */}
      {(suggestion.cardContent || suggestion.cardDescription) && (
        <div className="px-3 pb-1 pt-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-indigo-500 hover:text-indigo-700"
          >
            {expanded ? "Hide detail ↑" : "Show detail ↓"}
          </button>
          {expanded && (
            <div className="mt-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              {suggestion.cardContent && (
                <p className="font-medium">{suggestion.cardContent}</p>
              )}
              {suggestion.cardDescription && suggestion.cardDescription !== suggestion.cardContent && (
                <p className="mt-1 text-gray-500">{suggestion.cardDescription}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-end gap-2 border-t border-gray-50 px-3 py-2">
        <button
          type="button"
          onClick={onIgnore}
          className="rounded px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
        >
          Ignore
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={isApplying || !suggestion.targetBoardId}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          title={!suggestion.targetBoardId ? "Board not matched — cannot apply" : undefined}
        >
          {isApplying ? "Applying…" : "Apply"}
        </button>
      </div>
    </div>
  );
}
