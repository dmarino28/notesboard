"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { SignalType } from "@/lib/noteSignals";
import { buildTextSegments } from "@/lib/noteSignals";
import { getBoardAccentStyle } from "./ContextBadge";

/** Subtle text-only colors for non-board signals — no backgrounds. */
const SIGNAL_TEXT_COLORS: Record<string, string> = {
  milestone: "#b45309", // amber-700
  market:    "#0f766e", // teal-700
  channel:   "#6d28d9", // violet-700
  date:      "#047857", // emerald-700
};

type Props = {
  entry: NoteEntryWithSignals;
  boards: BoardRow[];
  isFocused: boolean;
  isSelected: boolean;
  onFocus: (id: string) => void;
  onBlur: (id: string, content: string) => void;
  onChange: (id: string, content: string) => void;
  onEnter: (id: string, cursorPos: number) => void;
  onBackspace: (id: string, isEmpty: boolean) => void;
  onIndent: (id: string, direction: "in" | "out") => void;
  onArrow: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
};

/** Extract the last partial word being typed (returns "" if none or ends with space). */
function getLastPartialWord(content: string): string {
  const m = content.match(/(\S+)$/);
  return m ? m[1] : "";
}

/** Find a board whose name starts with `prefix` (case-insensitive, ≥2 chars, not already complete). */
function findBoardAutocomplete(prefix: string, boards: BoardRow[]): BoardRow | null {
  if (prefix.length < 2) return null;
  const lp = prefix.toLowerCase();
  return (
    boards.find(
      (b) =>
        b.name.toLowerCase().startsWith(lp) &&
        b.name.toLowerCase() !== lp
    ) ?? null
  );
}

export function NoteEntryRow({
  entry,
  boards,
  isFocused,
  isSelected,
  onFocus,
  onBlur,
  onChange,
  onEnter,
  onBackspace,
  onIndent,
  onArrow,
  onSelect,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autocomplete, setAutocomplete] = useState<{ board: BoardRow; suffix: string } | null>(null);

  // Auto-resize textarea height to content
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [entry.content, isFocused]);

  // Focus textarea and move cursor to end when this entry becomes focused
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }, [isFocused]);

  // Update autocomplete suggestion as content changes
  useEffect(() => {
    if (!isFocused) {
      setAutocomplete(null);
      return;
    }
    const prefix = getLastPartialWord(entry.content);
    const match = findBoardAutocomplete(prefix, boards);
    if (match) {
      setAutocomplete({ board: match, suffix: match.name.slice(prefix.length) });
    } else {
      setAutocomplete(null);
    }
  }, [entry.content, isFocused, boards]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;

      if (e.key === "Tab") {
        e.preventDefault();
        if (autocomplete) {
          // Accept autocomplete: replace partial prefix with full board name
          const prefix = getLastPartialWord(ta.value);
          const newContent =
            ta.value.slice(0, ta.value.length - prefix.length) + autocomplete.board.name;
          onChange(entry.id, newContent);
          setAutocomplete(null);
        } else {
          onIndent(entry.id, e.shiftKey ? "out" : "in");
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onEnter(entry.id, ta.selectionStart);
        return;
      }

      if (e.key === "Backspace" && ta.value === "") {
        e.preventDefault();
        onBackspace(entry.id, true);
        return;
      }

      if (
        e.key === "Backspace" &&
        ta.selectionStart === 0 &&
        ta.selectionEnd === 0
      ) {
        onBackspace(entry.id, false);
        return;
      }

      if (e.key === "ArrowUp" && ta.selectionStart === 0) {
        onArrow(entry.id, "up");
        return;
      }

      if (e.key === "ArrowDown" && ta.selectionStart === ta.value.length) {
        onArrow(entry.id, "down");
        return;
      }
    },
    [entry.id, autocomplete, onChange, onEnter, onIndent, onBackspace, onArrow]
  );

  // ─── Board context ───────────────────────────────────────────────────────────
  const resolvedBoardId = entry.explicit_board_id ?? entry.inferred_board_id ?? null;
  const boardAccent = resolvedBoardId ? getBoardAccentStyle(resolvedBoardId, boards) : null;
  const boardHex = boardAccent?.hex ?? null;

  // ─── Row style: background tint + left gutter ────────────────────────────────
  const rowStyle: React.CSSProperties = {};
  if (isFocused && boardHex) {
    rowStyle.backgroundColor = `${boardHex}0d`; // ~5% opacity tint
  }
  if (entry.context_source === "inherited" && boardHex) {
    rowStyle.borderLeft = `2px solid ${boardHex}4d`; // 30% opacity gutter
    rowStyle.paddingLeft = `${6 + entry.indent_level * 20}px`;
  } else {
    rowStyle.paddingLeft = `${8 + entry.indent_level * 20}px`;
  }

  // ─── Signal segments for display mode ───────────────────────────────────────
  const signalsForDisplay = entry.signals.map((s) => ({
    type: s.signal_type as SignalType,
    value: s.signal_value,
    matchText: s.match_text,
    matchStart: s.match_start ?? 0,
    matchEnd: s.match_end ?? 0,
    normalizedValue: s.normalized_value ?? undefined,
  }));
  const segments = buildTextSegments(entry.content, signalsForDisplay);

  return (
    <div
      className={`group relative flex items-start gap-2 rounded-[5px] py-[3px] transition-colors duration-75 ${
        isSelected ? "bg-indigo-50/60" : ""
      }`}
      style={rowStyle}
    >
      {/* Bullet dot — adopts board color */}
      <span
        className="mt-[8px] h-[5px] w-[5px] flex-shrink-0 rounded-full transition-colors duration-150"
        style={{ backgroundColor: boardHex ?? "#d1d5db" }}
      />

      <div className="min-w-0 flex-1">
        {/* ── Display mode (blurred): colored inline segments ─────────────────── */}
        {!isFocused && (
          <div
            className="cursor-text whitespace-pre-wrap break-words py-px text-sm leading-relaxed text-gray-800 min-h-[1.5rem]"
            onClick={() => onFocus(entry.id)}
          >
            {entry.content ? (
              segments.map((seg, i) => {
                if (!seg.signal) {
                  return <span key={i}>{seg.text}</span>;
                }

                if (seg.signal.type === "board") {
                  const hex = getBoardAccentStyle(seg.signal.value, boards).hex;
                  return (
                    <span key={i} style={{ color: hex, fontWeight: 600 }}>
                      {seg.text}
                    </span>
                  );
                }

                const color = SIGNAL_TEXT_COLORS[seg.signal.type] ?? "#6b7280";
                return (
                  <span key={i} style={{ color }}>
                    {seg.text}
                  </span>
                );
              })
            ) : (
              <span className="text-gray-300">Type a note…</span>
            )}
          </div>
        )}

        {/* ── Edit mode (focused): textarea + autocomplete hint ───────────────── */}
        {isFocused && (
          <>
            <textarea
              ref={textareaRef}
              className="w-full resize-none overflow-hidden bg-transparent py-px text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-300"
              value={entry.content}
              placeholder="Type a note…"
              rows={1}
              onChange={(e) => onChange(entry.id, e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => onFocus(entry.id)}
              onBlur={(e) => onBlur(entry.id, e.target.value)}
            />

            {/* Board autocomplete hint */}
            {autocomplete && (
              <div className="flex items-center gap-1.5 pb-0.5 pt-0.5">
                <span className="text-[11px] text-gray-400">
                  <span className="font-medium text-gray-600">{autocomplete.board.name}</span>
                </span>
                <kbd className="inline-flex items-center rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-400">
                  ⇥
                </kbd>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selection checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(entry.id);
        }}
        className={`mt-[5px] flex-shrink-0 rounded p-0.5 transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
        title="Select entry"
        aria-label="Select entry"
      >
        <div
          className={`h-3 w-3 rounded-[3px] border transition-colors ${
            isSelected
              ? "border-indigo-500 bg-indigo-500"
              : "border-gray-300 bg-white"
          }`}
        >
          {isSelected && (
            <svg
              viewBox="0 0 10 10"
              fill="none"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2,5 4.5,7.5 8,2.5" />
            </svg>
          )}
        </div>
      </button>
    </div>
  );
}
