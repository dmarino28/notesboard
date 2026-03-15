"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { NoteEntryWithSignals } from "@/lib/noteEntries";
import type { BoardRow } from "@/lib/boards";
import type { SignalType } from "@/lib/noteSignals";
import { buildTextSegments, NOTE_SIGNAL_MIN_CHARS } from "@/lib/noteSignals";
import type { AISuggestion } from "@/lib/ai/noteOrganize";
import { resolveBoardHex } from "./ContextBadge";
import { type AliasMap, generateBoardAliases } from "@/lib/noteAliases";
import { isTemp } from "./tempId";
import {
  type NoteTemplate,
  getAllTemplates,
  filterTemplates,
} from "@/lib/noteTemplates";

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
  hasError?: boolean;
  /** Overrides the default "Type a note…" placeholder for empty capture rows. */
  placeholder?: string;
  onFocus: (id: string) => void;
  onBlur: (id: string, content: string) => void;
  onChange: (id: string, content: string) => void;
  onEnter: (id: string, cursorPos: number) => void;
  onBackspace: (id: string, isEmpty: boolean) => void;
  onIndent: (id: string, direction: "in" | "out") => void;
  onArrow: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
  onOrganize?: () => void;
  onRetry?: (id: string, content: string) => void;
  /** Called when a single-entry board suggestion has been accepted and applied. */
  onSuggestApplied?: (entryId: string) => void;
  /** Called to archive this note (reuses the backspace-on-empty deferred-DELETE system). */
  onArchive?: (id: string) => void;
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
  if (lastWord.length < NOTE_SIGNAL_MIN_CHARS) return null;
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
  hasError,
  placeholder = "Type a note…",
  onFocus,
  onBlur,
  onChange,
  onEnter,
  onBackspace,
  onIndent,
  onArrow,
  onSelect,
  onOrganize,
  onRetry,
  onSuggestApplied,
  onArchive,
  userAliases,
  onConfirmAlias,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autocomplete, setAutocomplete] = useState<AutocompleteResult | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Template menu state — active when content starts with "/" and has no space.
  // allItems: full unfiltered list loaded once when menu opens (avoids getAllTemplates() on every keystroke).
  // items: currently displayed filtered subset.
  const [templateMenu, setTemplateMenu] = useState<{
    allItems: NoteTemplate[];
    items: NoteTemplate[];
    selectedIdx: number;
  } | null>(null);

  // Board link autocomplete — active when content contains "[[ without closing ]]"
  const [linkAutocomplete, setLinkAutocomplete] = useState<{
    query: string;
    results: BoardRow[];
  } | null>(null);

  // Inline "Suggest board" state
  const [inlineSugg, setInlineSugg] = useState<{
    loading: boolean;
    suggestion: AISuggestion | null;
    applying: boolean;
    noResult: boolean;
  }>({ loading: false, suggestion: null, applying: false, noResult: false });

  const handleSuggestBoard = useCallback(async () => {
    if (isTemp(entry.id)) return;
    setInlineSugg({ loading: true, suggestion: null, applying: false, noResult: false });
    try {
      const res = await fetch("/api/ai/notes-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: [entry.id] }),
      });
      if (res.ok) {
        const { suggestions } = (await res.json()) as { suggestions: AISuggestion[] };
        const first = suggestions.find((s) => s.targetBoardId) ?? null;
        setInlineSugg({ loading: false, suggestion: first, applying: false, noResult: !first });
      } else {
        setInlineSugg({ loading: false, suggestion: null, applying: false, noResult: true });
      }
    } catch {
      setInlineSugg({ loading: false, suggestion: null, applying: false, noResult: true });
    }
  }, [entry.id]);

  const handleAcceptSuggestion = useCallback(async () => {
    const s = inlineSugg.suggestion;
    if (!s) return;
    setInlineSugg((prev) => ({ ...prev, applying: true }));
    try {
      await fetch("/api/ai/notes-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: s.type,
          targetBoardId: s.targetBoardId,
          targetColumnId: s.targetColumnId,
          cardContent: s.cardContent,
          cardDescription: s.cardDescription,
          milestoneField: s.milestoneField,
          milestoneValue: s.milestoneValue,
          sourceEntryIds: s.sourceEntryIds,
        }),
      });
      onSuggestApplied?.(entry.id);
      setInlineSugg({ loading: false, suggestion: null, applying: false, noResult: false });
    } catch {
      setInlineSugg((prev) => ({ ...prev, applying: false }));
    }
  }, [inlineSugg.suggestion, entry.id, onSuggestApplied]);

  // Auto-resize textarea height to content
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [entry.content, isFocused]);

  // Focus and move cursor to end when TRANSITIONING from unfocused → focused.
  // Uses prevFocusedRef to avoid jumping cursor to end on component remount
  // (which happens during temp→real ID migration while the user is typing).
  const prevFocusedRef = useRef(false);
  useEffect(() => {
    const wasFocused = prevFocusedRef.current;
    prevFocusedRef.current = isFocused;
    if (isFocused && !wasFocused && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [isFocused]);

  // Autocomplete detection — runs on every content change while focused.
  // Priority: template menu → board link autocomplete → normal board prefix autocomplete.
  useEffect(() => {
    if (!isFocused) {
      setAutocomplete(null);
      setTemplateMenu(null);
      setLinkAutocomplete(null);
      return;
    }

    // 1. Template menu: "/" at start with no space typed yet
    if (entry.content.startsWith("/") && !entry.content.includes(" ")) {
      const query = entry.content.slice(1);
      setAutocomplete(null);
      setLinkAutocomplete(null);
      setTemplateMenu((prev) => {
        // Load all templates once when the menu first opens; reuse on subsequent keystrokes.
        const allItems = prev?.allItems ?? getAllTemplates();
        const items = filterTemplates(query, allItems);
        return {
          allItems,
          items,
          // Reset selection when items narrow, preserve otherwise
          selectedIdx: Math.min(prev?.selectedIdx ?? 0, Math.max(0, items.length - 1)),
        };
      });
      return;
    }
    setTemplateMenu(null);

    // 2. Board link: "[[ without closing ]] anywhere in content
    const linkTriggerMatch = entry.content.match(/\[\[([^\]]*)$/);
    if (linkTriggerMatch !== null) {
      const query = linkTriggerMatch[1].toLowerCase();
      const results = boards
        .filter((b) => b.name.toLowerCase().startsWith(query) || b.name.toLowerCase().includes(query))
        .slice(0, 6);
      setAutocomplete(null);
      setLinkAutocomplete({ query: linkTriggerMatch[1], results });
      return;
    }
    setLinkAutocomplete(null);

    // 3. Normal board name prefix autocomplete
    const lastWord = getLastPartialWord(entry.content);
    const match = findBoardAutocomplete(lastWord, boards, userAliases ?? {});
    setAutocomplete(match);
  }, [entry.content, isFocused, boards, userAliases]);

  // Accept the current autocomplete suggestion (replaces typed prefix/alias with full board name)
  const acceptAutocomplete = useCallback(() => {
    if (!autocomplete || !textareaRef.current) return;
    const ta = textareaRef.current;
    if (autocomplete.kind === "alias" && !autocomplete.isConfirmed && onConfirmAlias) {
      onConfirmAlias(autocomplete.aliasText, autocomplete.board.id);
    }
    const lastWord = getLastPartialWord(ta.value);
    const newContent =
      ta.value.slice(0, ta.value.length - lastWord.length) + autocomplete.board.name;
    onChange(entry.id, newContent);
    setAutocomplete(null);
  }, [autocomplete, entry.id, onChange, onConfirmAlias]);

  // Insert a template, replacing the "/" trigger text with the template content.
  const insertTemplate = useCallback(
    (template: NoteTemplate) => {
      onChange(entry.id, template.content);
      setTemplateMenu(null);
      // Move cursor to end after React flushes the new content.
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const len = template.content.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      });
    },
    [entry.id, onChange]
  );

  // Complete a board link: replace the partial "[[query" with "[[Board Name]]".
  const acceptLinkAutocomplete = useCallback(
    (board: BoardRow) => {
      if (!textareaRef.current) return;
      // Find the last "[[ without closing ]]" and replace it.
      const newContent = entry.content.replace(/\[\[([^\]]*)$/, `[[${board.name}]]`);
      onChange(entry.id, newContent);
      setLinkAutocomplete(null);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const len = newContent.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      });
    },
    [entry.content, entry.id, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;

      // Tab / Shift+Tab → always indent/unindent (never accepts autocomplete)
      if (e.key === "Tab") {
        e.preventDefault();
        onIndent(entry.id, e.shiftKey ? "out" : "in");
        return;
      }

      // ── Template menu navigation ────────────────────────────────────────────
      if (templateMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setTemplateMenu((prev) =>
            prev ? { ...prev, selectedIdx: Math.min(prev.selectedIdx + 1, prev.items.length - 1) } : null
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setTemplateMenu((prev) =>
            prev ? { ...prev, selectedIdx: Math.max(prev.selectedIdx - 1, 0) } : null
          );
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const selected = templateMenu.items[templateMenu.selectedIdx];
          if (selected) {
            insertTemplate(selected);
          } else {
            // No template matched — dismiss the menu and commit the entry normally.
            setTemplateMenu(null);
            if (autocomplete) {
              acceptAutocomplete();
            } else {
              onEnter(entry.id, ta.selectionStart);
            }
          }
          return;
        }
        if (e.key === "Escape") {
          setTemplateMenu(null);
          return;
        }
      }

      // ── Board link autocomplete ─────────────────────────────────────────────
      if (linkAutocomplete && linkAutocomplete.results.length > 0) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          acceptLinkAutocomplete(linkAutocomplete.results[0]);
          return;
        }
        if (e.key === "ArrowRight" && ta.selectionStart === ta.value.length) {
          e.preventDefault();
          acceptLinkAutocomplete(linkAutocomplete.results[0]);
          return;
        }
        if (e.key === "Escape") {
          setLinkAutocomplete(null);
          return;
        }
      }

      // Escape → dismiss autocomplete suggestion
      if (e.key === "Escape" && autocomplete) {
        setAutocomplete(null);
        return;
      }

      // Enter → accept autocomplete if active, else split entry
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (autocomplete) {
          acceptAutocomplete();
        } else {
          onEnter(entry.id, ta.selectionStart);
        }
        return;
      }

      // ArrowRight at end of line → accept autocomplete if active
      if (e.key === "ArrowRight" && ta.selectionStart === ta.value.length && autocomplete) {
        e.preventDefault();
        acceptAutocomplete();
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
    [entry.id, autocomplete, acceptAutocomplete, templateMenu, insertTemplate, linkAutocomplete, acceptLinkAutocomplete, onEnter, onIndent, onBackspace, onArrow]
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
        {/* Bullet dot — open ring for empty entries, filled dot for entries with content */}
        <span
          className="mt-[8px] h-[5px] w-[5px] flex-shrink-0 rounded-full transition-all duration-150"
          style={
            entry.content === ""
              ? { backgroundColor: "transparent", border: "1.5px solid #d1d5db" }
              : { backgroundColor: resolvedBoardHex ?? "#d1d5db" }
          }
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

                  if (seg.signal.type === "link") {
                    // [[Board Name]] → render as a clickable board link chip.
                    // The matchText includes the [[ and ]] brackets; display only the inner name.
                    const boardId = seg.signal.value.length === 36 ? seg.signal.value : null;
                    const hex = boardId ? resolveBoardHex(boardId, boards) ?? "#6366f1" : "#6366f1";
                    const displayName = seg.signal.normalizedValue ?? seg.text.replace(/^\[\[|\]\]$/g, "");
                    const href = boardId ? `/board/${boardId}` : null;
                    const chip = (
                      <span
                        key={i}
                        className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[11px] font-medium"
                        style={{
                          backgroundColor: `${hex}18`,
                          color: hex,
                          border: `1px solid ${hex}30`,
                          verticalAlign: "baseline",
                        }}
                      >
                        <span className="text-[9px]" style={{ color: hex, opacity: 0.7 }}>↗</span>
                        {displayName}
                      </span>
                    );
                    if (href) {
                      return (
                        <a
                          key={i}
                          href={href}
                          onClick={(e) => e.stopPropagation()}
                          className="no-underline"
                        >
                          {chip}
                        </a>
                      );
                    }
                    return chip;
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
                <span className="text-gray-400">{placeholder}</span>
              )}
            </div>
          )}

          {/* ── Edit mode: textarea + autocomplete hint ──────────────────────── */}
          {isFocused && (
            <>
              <textarea
                ref={textareaRef}
                className="w-full resize-none overflow-hidden bg-transparent py-px text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-400"
                value={entry.content}
                placeholder={placeholder}
                rows={1}
                onChange={(e) => onChange(entry.id, e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => onFocus(entry.id)}
                onBlur={(e) => onBlur(entry.id, e.target.value)}
              />

              {autocomplete && (() => {
                const boardHex = resolveBoardHex(autocomplete.board.id, boards) ?? "#6366f1";
                return (
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 pb-0.5 pt-0.5">
                    {autocomplete.kind === "alias" && (
                      <span className="text-[10px] font-medium" style={{ color: boardHex, opacity: 0.7 }}>
                        {autocomplete.aliasText} →
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">Switch to board:</span>
                    <span className="text-[11px] font-semibold" style={{ color: boardHex }}>
                      {autocomplete.board.name}
                    </span>
                    {autocomplete.kind === "alias" && !autocomplete.isConfirmed && (
                      <span className="text-[10px] text-gray-400 italic">· confirm shorthand</span>
                    )}
                    <span className="text-[10px] text-gray-300">· Enter ↵ · Esc</span>
                  </div>
                );
              })()}

              {/* Board link autocomplete — shown when user types [[ */}
              {linkAutocomplete && linkAutocomplete.results.length > 0 && (
                <div className="mt-0.5 rounded-lg border border-indigo-100 bg-white shadow-md">
                  <div className="px-2 py-1 text-[10px] text-gray-400 border-b border-gray-50">
                    ↗ Link to board · Enter to select · Esc to dismiss
                  </div>
                  {linkAutocomplete.results.map((board, idx) => {
                    const hex = resolveBoardHex(board.id, boards) ?? "#6366f1";
                    return (
                      <button
                        key={board.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); acceptLinkAutocomplete(board); }}
                        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-indigo-50 ${idx === 0 ? "bg-indigo-50/40" : ""}`}
                      >
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                        <span className="font-medium" style={{ color: hex }}>{board.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Template menu — shown when user types "/" at start */}
              {templateMenu && templateMenu.items.length > 0 && (
                <div className="mt-0.5 rounded-lg border border-gray-200 bg-white shadow-md overflow-hidden">
                  <div className="px-2 py-1 text-[10px] text-gray-400 border-b border-gray-50">
                    ↑↓ navigate · Enter insert · Esc dismiss
                  </div>
                  {templateMenu.items.map((tpl, idx) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); insertTemplate(tpl); }}
                      className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-gray-50 ${
                        idx === templateMenu.selectedIdx ? "bg-gray-50" : ""
                      }`}
                    >
                      <span className="w-4 text-center text-xs text-gray-400">{tpl.icon}</span>
                      <span className="flex-1 text-xs font-medium text-gray-700">{tpl.label}</span>
                      <span className="text-[10px] text-gray-300">/{tpl.shortcut}</span>
                    </button>
                  ))}
                </div>
              )}
              {templateMenu && templateMenu.items.length === 0 && (
                <div className="mt-0.5 px-2 py-1 text-[11px] text-gray-400">
                  No template matches — keep typing or Esc
                </div>
              )}
            </>
          )}
        </div>

        {/* Suggest board button — only for unrouted, non-empty, persisted entries */}
        {!entry.explicit_board_id && entry.content.trim() && !isTemp(entry.id) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleSuggestBoard();
            }}
            disabled={inlineSugg.loading || inlineSugg.applying}
            className={`mt-[5px] flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-medium text-indigo-400 transition-opacity hover:text-indigo-600 disabled:opacity-40 ${
              inlineSugg.loading || inlineSugg.suggestion || inlineSugg.noResult
                ? "opacity-60"
                : "opacity-25 group-hover:opacity-100"
            }`}
            title="Suggest a board for this note"
          >
            {inlineSugg.loading ? "…" : "→"}
          </button>
        )}

        {/* Archive button — visible at low opacity at rest, full on hover */}
        {entry.content.trim() && !isTemp(entry.id) && onArchive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onArchive(entry.id);
            }}
            className="mt-[5px] flex-shrink-0 rounded p-0.5 text-gray-300 opacity-25 transition-opacity hover:text-gray-500 hover:opacity-100"
            title="Archive note"
            aria-label="Archive note"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 2l7 7M9 2L2 9" />
            </svg>
          </button>
        )}

        {/* Selection checkbox */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(entry.id);
          }}
          className={`mt-[5px] flex-shrink-0 rounded p-0.5 transition-opacity ${
            isSelected ? "opacity-100" : "opacity-25 group-hover:opacity-100"
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

      {/* Save error indicator — shown when the last save attempt failed */}
      {hasError && (
        <div className="flex items-center gap-1 pb-0.5 pl-4">
          <span className="text-[10px] text-red-500">Unsaved</span>
          <span className="text-[10px] text-gray-300">·</span>
          <button
            type="button"
            className="text-[10px] text-red-500 underline hover:text-red-700"
            onClick={() => onRetry?.(entry.id, entry.content)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Inline board suggestion */}
      {(inlineSugg.suggestion || inlineSugg.noResult) && (
        <div className="ml-4 mb-1 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          {inlineSugg.noResult ? (
            <>
              <span className="text-[11px] text-gray-500 flex-1">No board suggestion found.</span>
              <button
                type="button"
                className="text-[10px] text-gray-400 hover:text-gray-600"
                onClick={() => setInlineSugg({ loading: false, suggestion: null, applying: false, noResult: false })}
              >
                Dismiss
              </button>
            </>
          ) : inlineSugg.suggestion && (
            <>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-indigo-700">
                  {inlineSugg.suggestion.targetBoardName}
                </span>
                <span className="mx-1 text-[11px] text-gray-400">·</span>
                <span className="text-[11px] text-gray-600">{inlineSugg.suggestion.description}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  disabled={inlineSugg.applying}
                  onClick={() => void handleAcceptSuggestion()}
                  className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {inlineSugg.applying ? "…" : "Apply"}
                </button>
                <button
                  type="button"
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                  onClick={() => setInlineSugg({ loading: false, suggestion: null, applying: false, noResult: false })}
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
