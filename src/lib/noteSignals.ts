/**
 * noteSignals.ts
 *
 * Pure, deterministic signal detection for note entries.
 * No Supabase calls — safe to run client-side or server-side.
 *
 * Detection pipeline:
 *   1. Board names  (matched against live board list, word-boundary aware)
 *   2. Milestones   (static dictionary)
 *   3. Markets      (static dictionary)
 *   4. Channels     (static dictionary)
 *   5. Dates        (regex-based)
 *
 * Overlapping matches are resolved by preferring longer matches.
 */

export type SignalType = "board" | "milestone" | "channel" | "market" | "date";

export interface Signal {
  type: SignalType;
  /** For boards: the board UUID. For others: canonical term string. */
  value: string;
  /** Exact text matched in the entry content. */
  matchText: string;
  matchStart: number;
  matchEnd: number;
  /** Human-readable label (board name, normalized term, etc.) */
  normalizedValue?: string;
}

export interface BoardRef {
  id: string;
  name: string;
}

// ─── Static Dictionaries ────────────────────────────────────────────────────
// Ordered longest-first within each category so longer phrases win over substrings.

export const MILESTONE_TERMS: string[] = [
  "campaign overview",
  "creative lock",
  "artwork lock",
  "trailer debut",
  "press tour",
  "press night",
  "award nomination",
  "awards campaign",
  "title card",
  "key art",
  "teaser trailer",
  "theatrical release",
  "wide release",
  "limited release",
  "opening weekend",
  "premiere",
  "festival",
  "screening",
  "certification",
  "censorship",
  "trailer",
  "teaser",
  "poster",
  "rating",
  "junket",
  "release",
  "overview",
  "award",
];

export const MARKET_TERMS: string[] = [
  "Middle East",
  "Southeast Asia",
  "Latin America",
  "LATAM",
  "APAC",
  "EMEA",
  "Australia",
  "China",
  "Japan",
  "Korea",
  "India",
  "Brazil",
  "Mexico",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Russia",
  "Nordics",
  "ANZ",
  "SEA",
  "UK",
  "AU",
];

export const CHANNEL_TERMS: string[] = [
  "out of home",
  "paid social",
  "brand partnership",
  "in-cinema",
  "experiential",
  "activations",
  "activation",
  "influencer",
  "partnership",
  "promotions",
  "promotion",
  "creative",
  "digital",
  "social",
  "events",
  "retail",
  "cinema",
  "radio",
  "press",
  "OOH",
  "TV",
  "PR",
];

// ─── Date Detection Patterns ─────────────────────────────────────────────────

const MONTH_NAMES =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const ORDINAL = "(?:st|nd|rd|th)?";
const DAY_NUM = `\\d{1,2}${ORDINAL}`;
const DAY_NAME = "(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";

const DATE_PATTERNS: RegExp[] = [
  // "week of March 23", "week of April 13"
  new RegExp(`\\bweek\\s+of\\s+${MONTH_NAMES}\\s+${DAY_NUM}\\b`, "gi"),
  // "March 23", "April 13th"
  new RegExp(`\\b${MONTH_NAMES}\\s+${DAY_NUM}\\b`, "gi"),
  // "23 March", "13th April"
  new RegExp(`\\b${DAY_NUM}\\s+${MONTH_NAMES}\\b`, "gi"),
  // "next Tuesday", "this Friday", "last Monday"
  new RegExp(`\\b(?:next|this|last)\\s+${DAY_NAME}\\b`, "gi"),
  // "next week", "this week", "next month"
  /\b(?:next|this|last)\s+(?:week|month|quarter)\b/gi,
  // "today", "tomorrow", "yesterday"
  /\b(?:today|tomorrow|yesterday)\b/gi,
  // "Mon 9am", "Fri 2pm", "Wed 14:30"
  new RegExp(`\\b${DAY_NAME}\\s+\\d{1,2}(?::\\d{2})?(?:am|pm)?\\b`, "gi"),
  // "Q1 2026", "Q3 2025"
  /\bq[1-4]\s+\d{4}\b/gi,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if character at position is a word-boundary-style separator. */
function isBoundary(ch: string | undefined): boolean {
  return !ch || /[\s\-:,./()[\]"'@#]/.test(ch);
}

/** Check word boundaries around a match at [start, end) in content. */
function hasWordBoundaries(content: string, start: number, end: number): boolean {
  return isBoundary(content[start - 1]) && isBoundary(content[end]);
}

/** Remove signals that are fully contained within another (prefer longer). */
function deduplicateOverlaps(signals: Signal[]): Signal[] {
  // Sort longest first
  const sorted = [...signals].sort(
    (a, b) => b.matchEnd - b.matchStart - (a.matchEnd - a.matchStart)
  );
  const kept: Signal[] = [];
  for (const s of sorted) {
    const overlaps = kept.some(
      (k) => s.matchStart < k.matchEnd && k.matchStart < s.matchEnd
    );
    if (!overlaps) kept.push(s);
  }
  // Re-sort by position
  return kept.sort((a, b) => a.matchStart - b.matchStart);
}

// ─── Main Detection Function ──────────────────────────────────────────────────

/**
 * Detect all signals in a single entry's content.
 *
 * @param content  Raw text of the entry
 * @param boards   Live board list (used for board-name detection)
 */
export function detectSignals(content: string, boards: BoardRef[]): Signal[] {
  const lower = content.toLowerCase();
  const signals: Signal[] = [];

  // 1. Board names
  for (const board of boards) {
    if (!board.name.trim()) continue;
    const nameLower = board.name.toLowerCase();
    let idx = lower.indexOf(nameLower);
    while (idx !== -1) {
      if (hasWordBoundaries(content, idx, idx + nameLower.length)) {
        signals.push({
          type: "board",
          value: board.id,
          matchText: content.slice(idx, idx + nameLower.length),
          matchStart: idx,
          matchEnd: idx + nameLower.length,
          normalizedValue: board.name,
        });
      }
      idx = lower.indexOf(nameLower, idx + 1);
    }
  }

  // 2. Milestones
  for (const term of MILESTONE_TERMS) {
    const termLower = term.toLowerCase();
    let idx = lower.indexOf(termLower);
    while (idx !== -1) {
      if (hasWordBoundaries(content, idx, idx + termLower.length)) {
        signals.push({
          type: "milestone",
          value: term,
          matchText: content.slice(idx, idx + termLower.length),
          matchStart: idx,
          matchEnd: idx + termLower.length,
          normalizedValue: term,
        });
      }
      idx = lower.indexOf(termLower, idx + termLower.length);
    }
  }

  // 3. Markets
  for (const term of MARKET_TERMS) {
    const termLower = term.toLowerCase();
    let idx = lower.indexOf(termLower);
    while (idx !== -1) {
      if (hasWordBoundaries(content, idx, idx + termLower.length)) {
        signals.push({
          type: "market",
          value: term,
          matchText: content.slice(idx, idx + termLower.length),
          matchStart: idx,
          matchEnd: idx + termLower.length,
          normalizedValue: term,
        });
      }
      idx = lower.indexOf(termLower, idx + termLower.length);
    }
  }

  // 4. Channels
  for (const term of CHANNEL_TERMS) {
    const termLower = term.toLowerCase();
    let idx = lower.indexOf(termLower);
    while (idx !== -1) {
      if (hasWordBoundaries(content, idx, idx + termLower.length)) {
        signals.push({
          type: "channel",
          value: term,
          matchText: content.slice(idx, idx + termLower.length),
          matchStart: idx,
          matchEnd: idx + termLower.length,
          normalizedValue: term,
        });
      }
      idx = lower.indexOf(termLower, idx + termLower.length);
    }
  }

  // 5. Dates
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      signals.push({
        type: "date",
        value: match[0].toLowerCase(),
        matchText: match[0],
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
        normalizedValue: match[0],
      });
    }
  }

  return deduplicateOverlaps(signals);
}

/** Extract the first board signal from a signal list. */
export function extractBoardSignal(signals: Signal[]): Signal | undefined {
  return signals.find((s) => s.type === "board");
}

/** Group signals by type for display. */
export function groupSignalsByType(signals: Signal[]): Record<SignalType, Signal[]> {
  return {
    board: signals.filter((s) => s.type === "board"),
    milestone: signals.filter((s) => s.type === "milestone"),
    channel: signals.filter((s) => s.type === "channel"),
    market: signals.filter((s) => s.type === "market"),
    date: signals.filter((s) => s.type === "date"),
  };
}

/**
 * Build highlighted HTML from entry content + signals.
 * Returns an array of {text, signal?} segments for rendering.
 */
export interface TextSegment {
  text: string;
  signal?: Signal;
}

export function buildTextSegments(content: string, signals: Signal[]): TextSegment[] {
  if (signals.length === 0) return [{ text: content }];

  const sorted = [...signals].sort((a, b) => a.matchStart - b.matchStart);
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const sig of sorted) {
    if (sig.matchStart > cursor) {
      segments.push({ text: content.slice(cursor, sig.matchStart) });
    }
    segments.push({ text: content.slice(sig.matchStart, sig.matchEnd), signal: sig });
    cursor = sig.matchEnd;
  }

  if (cursor < content.length) {
    segments.push({ text: content.slice(cursor) });
  }

  return segments;
}
