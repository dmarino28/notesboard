/**
 * noteAliases.ts
 *
 * Board shorthand / alias detection and learned-alias storage.
 *
 * Aliases are stored per-user in localStorage:
 *   "nb_board_aliases_v1" → JSON { "twky": "board-uuid", ... }
 *
 * Detection priority (per detectSignals):
 *   1. Exact board title match (handled by noteSignals core)
 *   2. User-confirmed alias (localStorage) → direct_match, no prompt
 *   3. Generated heuristic alias → shown in autocomplete with "confirm" prompt
 */

import type { BoardRef } from "./noteSignals";

export type AliasMap = Record<string, string>; // lowercase alias → boardId

const STORAGE_KEY = "nb_board_aliases_v1";

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "at", "in", "on", "and", "or", "to",
  "for", "by", "with", "from", "into", "through",
]);

// ─── localStorage helpers ─────────────────────────────────────────────────────

export function loadUserAliases(): AliasMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as AliasMap;
  } catch {
    return {};
  }
}

/**
 * Save an alias and return the updated map.
 * The alias is normalized to lowercase before saving.
 */
export function saveUserAlias(alias: string, boardId: string): AliasMap {
  const existing = loadUserAliases();
  existing[alias.toLowerCase()] = boardId;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch {}
  }
  return existing;
}

// ─── Heuristic alias generation ──────────────────────────────────────────────

/**
 * Generate deterministic alias candidates for a board name.
 * Returns lowercase strings.
 *
 * Examples:
 *   "They Will Kill You"    → ["twky"]
 *   "The Mummy"             → ["mummy", "tm"]
 *   "Dune Part 3"           → ["dp3", "dune"]
 *   "Wuthering Heights"     → ["wh"]
 *   "The End of Oak St"     → ["teoos", "oak"]
 *   "One Battle After Another" → ["obaa", "one battle"]
 */
export function generateBoardAliases(name: string): string[] {
  const aliases: string[] = [];
  const words = name.split(/[\s\-_]+/).filter((w) => w.length > 0);
  const lwords = words.map((w) => w.toLowerCase());

  // 1. Initials of all words: "They Will Kill You" → "twky"
  if (words.length >= 2) {
    const initials = lwords.map((w) => w[0]).join("");
    if (initials.length >= 2) aliases.push(initials);
  }

  // 2. Strip leading article, derive aliases from remaining words
  const hasLeadingArticle = STOP_WORDS.has(lwords[0]);
  const noStopWords = hasLeadingArticle ? words.slice(1) : words;
  const noStopL = noStopWords.map((w) => w.toLowerCase());

  if (hasLeadingArticle && noStopWords.length > 0) {
    // "The Mummy" → "mummy" (single word after article)
    if (noStopWords.length === 1 && noStopL[0].length >= 3) {
      aliases.push(noStopL[0]);
    }
    // "The End of Oak St" → alternate initials without article
    if (noStopWords.length >= 2) {
      const altInitials = noStopL.map((w) => w[0]).join("");
      if (altInitials.length >= 2 && !aliases.includes(altInitials)) {
        aliases.push(altInitials);
      }
    }
  }

  // 3. First significant (non-stop) word ≥ 3 chars: "Dune Part 3" → "dune"
  const firstSig = lwords.find((w) => !STOP_WORDS.has(w) && w.length >= 3);
  if (firstSig && !aliases.includes(firstSig) && firstSig !== name.toLowerCase()) {
    aliases.push(firstSig);
  }

  // 4. Two-word shorthand from non-stop, ≥2 char words
  const sigWords = lwords.filter((w) => !STOP_WORDS.has(w) && w.length >= 2);
  if (sigWords.length >= 2) {
    const twoWord = `${sigWords[0]} ${sigWords[1]}`;
    if (!aliases.includes(twoWord) && twoWord !== name.toLowerCase()) {
      aliases.push(twoWord);
    }
  }

  return [...new Set(aliases)];
}

// ─── Lookup builder ────────────────────────────────────────────────────────────

/**
 * Build a combined alias → boardId map.
 * Generated aliases are added first (first board wins on collision).
 * User-confirmed aliases override on collision.
 */
export function buildAliasLookup(
  boards: BoardRef[],
  userAliases: AliasMap
): Map<string, string> {
  const map = new Map<string, string>();

  for (const board of boards) {
    for (const alias of generateBoardAliases(board.name)) {
      if (!map.has(alias)) map.set(alias, board.id);
    }
  }

  for (const [alias, boardId] of Object.entries(userAliases)) {
    map.set(alias.toLowerCase(), boardId);
  }

  return map;
}
