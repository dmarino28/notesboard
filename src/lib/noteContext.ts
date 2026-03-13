/**
 * noteContext.ts
 *
 * Transparent, rule-based context inference for note entries.
 * Pure functions — no Supabase calls, no magic.
 *
 * ─── Context Inference Rules ─────────────────────────────────────────────────
 *
 * 1. DIRECT MATCH: If an entry's detected signals include a board signal,
 *    that board is the explicit context.
 *    → explicit_board_id = board.id, context_source = "direct_match"
 *
 * 2. INHERITED: If an entry has no direct board signal, look backward
 *    through the preceding entries (same set, max LOOKBACK_LIMIT).
 *    Find the nearest entry with context_source = "direct_match".
 *    Inherit its explicit_board_id.
 *    → inferred_board_id = that_board_id, context_source = "inherited"
 *
 * 3. UNKNOWN: If no direct match is found within the lookback window,
 *    both board IDs are null.
 *    → context_source = "unknown"
 *
 * Inheritance limits:
 * - Maximum lookback: LOOKBACK_LIMIT entries (currently 20)
 * - Inheritance does NOT break on blank entries (v1 keeps it simple)
 * - A new explicit match always resets the inherited chain
 *
 * This design makes context predictable, debuggable, and easy to display.
 */

import type { Signal } from "./noteSignals";
import { extractBoardSignal } from "./noteSignals";

export type ContextSource = "direct_match" | "inherited" | "unknown";

/** Maximum number of entries to look back when inheriting context. */
const LOOKBACK_LIMIT = 20;

export interface EntryContextInput {
  id: string;
  content: string;
  position: number;
  indent_level: number;
  entry_date: string;
  explicit_board_id: string | null;
  inferred_board_id: string | null;
  context_source: ContextSource;
}

export interface EntryContextOutput extends EntryContextInput {
  explicit_board_id: string | null;
  inferred_board_id: string | null;
  context_source: ContextSource;
}

/**
 * Apply context inference to an ordered array of entries.
 *
 * @param entries   Entries sorted by (entry_date, position) ascending
 * @param signalMap Map of entry_id → detected signals for that entry
 */
export function inferContextForEntries(
  entries: EntryContextInput[],
  signalMap: Record<string, Signal[]>
): EntryContextOutput[] {
  const result: EntryContextOutput[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry: EntryContextOutput = { ...entries[i] };
    const signals = signalMap[entry.id] ?? [];
    const boardSignal = extractBoardSignal(signals);

    if (boardSignal) {
      // Rule 1: direct board match in this entry
      entry.explicit_board_id = boardSignal.value; // board UUID
      entry.inferred_board_id = null;
      entry.context_source = "direct_match";
    } else {
      // Rule 2: look back for an inherited board context
      const lookbackStart = Math.max(0, i - LOOKBACK_LIMIT);
      let inheritedBoardId: string | null = null;

      for (let j = i - 1; j >= lookbackStart; j--) {
        const prev = result[j];
        if (prev.context_source === "direct_match" && prev.explicit_board_id) {
          inheritedBoardId = prev.explicit_board_id;
          break;
        }
      }

      entry.explicit_board_id = null;
      entry.inferred_board_id = inheritedBoardId;
      entry.context_source = inheritedBoardId ? "inherited" : "unknown";
    }

    result.push(entry);
  }

  return result;
}

/**
 * Get the resolved board ID for an entry (explicit takes priority over inferred).
 */
export function resolvedBoardId(entry: EntryContextOutput): string | null {
  return entry.explicit_board_id ?? entry.inferred_board_id ?? null;
}

/**
 * Get a human-readable description of the context source.
 */
export function contextSourceLabel(source: ContextSource): string {
  switch (source) {
    case "direct_match":
      return "Detected";
    case "inherited":
      return "Inherited";
    case "unknown":
      return "Unknown board";
  }
}
