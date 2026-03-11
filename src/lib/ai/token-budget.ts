// Rough token estimation: ~4 chars per token (conservative)
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Truncate a string to at most `maxChars` characters, appending "…" if cut. */
export function trimToChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

// ── Per-feature payload budgets ────────────────────────────────────────────────

/** Board briefing — typically the largest context. */
export const BOARD_BRIEF = {
  /** Maximum cards included in context. Priority-ranked before slicing. */
  MAX_CARDS: 25,
  /** Maximum recent updates per card. */
  MAX_UPDATES_PER_CARD: 5,
  /** Maximum characters per update body. */
  MAX_UPDATE_CHARS: 300,
  /** Maximum characters for a card description snippet (not currently used in briefing,
   *  reserved for potential future inclusion). */
  MAX_DESCRIPTION_CHARS: 200,
  /**
   * Hard limit on total prompt character count.
   * Prompts exceeding this are rejected with a user-friendly error rather than
   * trimmed silently — the caller should narrow scope instead.
   * ~30K chars ≈ 7,500 tokens, well within Haiku's 200K context window.
   */
  HARD_PAYLOAD_CHAR_LIMIT: 30_000,
} as const;

/** Card summary — bounded by a single card's history. */
export const CARD_SUMMARY = {
  MAX_UPDATES: 10,
  MAX_UPDATE_CHARS: 400,
  MAX_DESCRIPTION_CHARS: 500,
  HARD_PAYLOAD_CHAR_LIMIT: 8_000,
} as const;

/** Ask the Board query — narrowed by keyword relevance before prompting. */
export const QUERY = {
  MAX_CARDS: 20,
  MAX_ACTIVITY_CHARS: 200,
  HARD_PAYLOAD_CHAR_LIMIT: 12_000,
} as const;
