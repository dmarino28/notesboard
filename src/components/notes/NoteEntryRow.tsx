"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { SignalType } from "@/lib/noteSignals";
import { buildTextSegments } from "@/lib/noteSignals";
import { resolveBoardHex } from "./ContextBadge";
import { type AliasMap, generateBoardAliases } from "@/lib/noteAliases";

/** Subtle text-only colors for non-board signals — no backgrounds. */
const SIGNAL_TEXT_COLORS: Record<string, string> = {
  milestone: "#b45309", // amber-700
  market:    "#0f766e", // teal-700
  channel:   "#6d28d9", // violet-700
  date:      "#047857", // emerald-700
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  board:     "Board",
  milestone: "Milestone",
  market:    "Market",
  channel:   "Channel",
  date:      "Date",
};

type PopoverState = {
  signalType: string;
  signalValue: string;
  boardName: string | null;
  boardHex: string | null;
  x: number;
  y: number;
};

type AutocompleteResult = {
  board: BoardRow;
  /** "prefix" = user is typing start of board name; "alias" = matched a shorthand */
  kind: "prefix" | "alias";
  /** The text the user actually typed that triggered this match */
  aliasText: string;
  /** True when the alias is already saved in localStorage (confirmed by user previously) */
  isConfirmed: boolean;
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
  onOrganize?: () => void;
  userAliases?: AliasMap;
  onConfirmAlias?: (alias: string, boardId: string) => void;
};

/** Extract the last partial word being typed (returns "" if ends with space). */
function getLastPartialWord(content: string): string {
  const m = content.match(/(\S+)$/);
  return m ? m[1] : "";
}

/**
 * Resolve autocomplete suggestion for the current last partial word.
 *
 * Priority:
 *   1. Prefix of a board name (e.g. "F" → "F1")
 *   2. Exact match of a confirmed user alias (auto, no prompt)
 *   3. Exact match of a generated heuristic alias (show "confirm" prompt)
 */
function findBoardAutocomplete(
  lastWord: string,
  boards: BoardRow[],
  userAliases: AliasMap
): AutocompleteResult | null {
  if (lastWord.length < 1) return null;
  const lp = lastWord.toLowerCase();

  // 1. Prefix of board name
  const prefixMatches = boards.filter(
    (b) => b.name.toLowerCase().startsWith(lp) && b.name.toLowerCase() !== lp
  );
  if (prefixMatches.length > 0) {
    const board = prefixMatches.sort((a, b) => a.name.length - b.name.length)[0];
    return { board, kind: "prefix", aliasText: lastWord, isConfirmed: true };
  }

  // 2. Confirmed user alias (exact match)
  const confirmedBoardId = userAliases[lp];
  if (confirmedBoardId) {
    const board = boards.find((b) => b.id === confirmedBoardId);
    if (board) return { board, kind: "alias", aliasText: lastWord, isConfirmed: true };
  }

  // 3. Generated heuristic alias (exact match — shown with "confirm" prompt)
  for (const board of boards) {
    if (generateBoardAliases(board.name).includes(lp)) {
      return { board, kind: "alias", aliasText: lastWord, isConfirmed: false };
    }
  }

  return null;
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
  onOrganize,
  userAliases,
  onConfirmAlias,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autocomplete, setAutocomplete] = useState<AutocompleteResult | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-resize textarea height to content
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [entry.content, isFocused]);

  // Focus and move cursor to end when entry becomes active
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }, [isFocused]);

  // Autocomplete detection — runs on every content change while focused
  useEffect(() => {
    if (!isFocused) {
      setAutocomplete(null);
      return;
    }
    const lastWord = getLastPartialWord(entry.content);
    const match = findBoardAutocomplete(lastWord, boards, userAliases ?? {});
    setAutocomplete(match);
  }, [entry.content, isFocused, boards, userAliases]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;

      if (e.key === "Tab") {
        e.preventDefault();
        // Shift+Tab always unindents — never accepts autocomplete
        if (!e.shiftKey && autocomplete) {
          // For unconfirmed alias candidates: save the alias before inserting
          if (autocomplete.kind === "alias" && !autocomplete.isConfirmed && onConfirmAlias) {
            onConfirmAlias(autocomplete.aliasText, autocomplete.board.id);
          }
          // Insert full board name (replaces the typed prefix or alias)
          const lastWord = getLastPartialWord(ta.value);
          const newContent =
            ta.value.slice(0, ta.value.length - lastWord.length) + autocomplete.board.name;
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

  // ─── Signal popover ────────────────────────────────────────────────────────

  const handleSignalMouseEnter = useCallback(
    (
      e: React.MouseEvent,
      signalType: string,
      signalValue: string,
      boardId: string | null
    ) => {
      clearTimeout(popoverTimer.current);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const board = boardId ? boards.find((b) => b.id === boardId) ?? null : null;
      setPopover({
        signalType,
        signalValue,
        boardName: board?.name ?? null,
        boardHex: boardId ? resolveBoardHex(boardId, boards) : null,
        x: rect.left,
        y: rect.bottom + 6,
      });
    },
    [boards]
  );

  const handleSignalMouseLeave = useCallback(() => {
    popoverTimer.current = setTimeout(() => setPopover(null), 150);
  }, []);

  // ─── Board context ─────────────────────────────────────────────────────────
  const resolvedBoardId = entry.explicit_board_id ?? entry.inferred_board_id ?? null;
  const resolvedBoardHex = resolveBoardHex(resolvedBoardId, boards);

  // Active tint: preview autocomplete board color while typing, else use resolved board
  const activeBoardId = isFocused && autocomplete ? autocomplete.board.id : resolvedBoardId;
  const activeBoardHex = resolveBoardHex(activeBoardId, boards);

  // ─── Row style: tint + inherited gutter ───────────────────────────────────
  const rowStyle: React.CSSProperties = {};
  if (isFocused && activeBoardHex) {
    rowStyle.backgroundColor = `${activeBoardHex}0d`; // ~5% opacity
  }
  if (entry.context_source === "inherited" && resolvedBoardHex) {
    rowStyle.borderLeft = `2px solid ${resolvedBoardHex}4d`; // 30% opacity gutter
    rowStyle.paddingLeft = `${6 + entry.indent_level * 20}px`;
  } else {
    rowStyle.paddingLeft = `${8 + entry.indent_level * 20}px`;
  }

  // ─── Signal segments for display mode ─────────────────────────────────────
  // Deduplicate signals by position (guards against DB duplicates / null positions)
  const seen = new Set<string>();
  const signalsForDisplay = entry.signals
    .filter((s) => s.match_start !== null && s.match_end !== null)
    .map((s) => ({
      type: s.signal_type as SignalType,
      value: s.signal_value,
      matchText: s.match_text,
      matchStart: s.match_start!,
      matchEnd: s.match_end!,
      normalizedValue: s.normalized_value ?? undefined,
    }))
    .filter((s) => {
      const key = `${s.matchStart}-${s.matchEnd}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const segments = buildTextSegments(entry.content, signalsForDisplay);

  return (
    <>
      <div
        className={`group relative flex items-start gap-2 rounded-[5px] py-[3px] transition-colors duration-75 ${
          isSelected ? "bg-indigo-50/60" : ""
        }`}
        style={rowStyle}
      >
        {/* Bullet dot — adopts resolved board color */}
        <span
          className="mt-[8px] h-[5px] w-[5px] flex-shrink-0 rounded-full transition-colors duration-150"
          style={{ backgroundColor: resolvedBoardHex ?? "#d1d5db" }}
        />

        <div className="min-w-0 flex-1">
          {/* ── Display mode: colored inline segments ───────────────────────── */}
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
                    const hex = resolveBoardHex(seg.signal.value, boards) ?? "#6366f1";
                    return (
                      <span
                        key={i}
                        style={{ color: hex, fontWeight: 600 }}
                        onMouseEnter={(e) =>
                          handleSignalMouseEnter(
                            e,
                            "board",
                            seg.signal!.normalizedValue ?? seg.signal!.matchText,
                            seg.signal!.value
                          )
                        }
                        onMouseLeave={handleSignalMouseLeave}
                      >
                        {seg.text}
                      </span>
                    );
                  }

                  const color = SIGNAL_TEXT_COLORS[seg.signal.type] ?? "#6b7280";
                  return (
                    <span
                      key={i}
                      style={{ color }}
                      onMouseEnter={(e) =>
                        handleSignalMouseEnter(
                          e,
                          seg.signal!.type,
                          seg.signal!.normalizedValue ?? seg.signal!.matchText,
                          resolvedBoardId
                        )
                      }
                      onMouseLeave={handleSignalMouseLeave}
                    >
                      {seg.text}
                    </span>
                  );
                })
              ) : (
                <span className="text-gray-300">Type a note…</span>
              )}
            </div>
          )}

          {/* ── Edit mode: textarea + autocomplete hint ──────────────────────── */}
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

              {autocomplete && (
                <div className="flex items-center gap-1.5 pb-0.5 pt-0.5">
                  {autocomplete.kind === "alias" && (
                    <span className="text-[10px] text-gray-400">
                      {autocomplete.aliasText} →
                    </span>
                  )}
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: resolveBoardHex(autocomplete.board.id, boards) ?? "#6366f1" }}
                  >
                    {autocomplete.board.name}
                  </span>
                  {autocomplete.kind === "alias" && !autocomplete.isConfirmed && (
                    <span className="text-[10px] text-gray-400 italic">confirm</span>
                  )}
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

      {/* Signal hover popover — fixed positioned to avoid overflow clipping */}
      {popover && (
        <div
          style={{
            position: "fixed",
            left: Math.min(popover.x, window.innerWidth - 220),
            top: popover.y,
            zIndex: 9999,
          }}
          className="w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
          onMouseEnter={() => clearTimeout(popoverTimer.current)}
          onMouseLeave={() => setPopover(null)}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {SIGNAL_TYPE_LABELS[popover.signalType] ?? popover.signalType}
            </span>
            <span className="truncate text-xs font-medium text-gray-800">
              {popover.signalValue}
            </span>
          </div>

          {popover.boardName && (
            <p className="mb-2.5 text-[11px] text-gray-500">
              Context:{" "}
              <span
                className="font-semibold"
                style={{ color: popover.boardHex ?? "#374151" }}
              >
                {popover.boardName}
              </span>
            </p>
          )}

          <div className="flex items-center gap-1.5">
            {onOrganize && (
              <button
                type="button"
                className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
                onClick={() => {
                  setPopover(null);
                  onOrganize();
                }}
              >
                Organize
              </button>
            )}
            <button
              type="button"
              className="rounded bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-100"
              onClick={() => setPopover(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
