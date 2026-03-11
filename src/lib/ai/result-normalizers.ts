import type {
  BoardBriefingResult,
  CardSummaryResult,
  QueryCard,
  QueryResult,
} from "./schemas";

/**
 * Strip markdown code fences the model sometimes wraps JSON in,
 * then JSON.parse. Throws on invalid JSON.
 */
function parseJSON(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Coerce a value to a string array, capped at `maxCount`.
 * Returns fewer items if the model provided fewer — the UI is responsible for
 * handling a short array gracefully. Never pads or fabricates content.
 */
function toStringArray(val: unknown, maxCount: number): string[] {
  if (!Array.isArray(val)) return [];
  return (val as unknown[]).map(String).filter(Boolean).slice(0, maxCount);
}

// ── Board Briefing ─────────────────────────────────────────────────────────────

export function normalizeBoardBriefing(
  text: string,
): { result: BoardBriefingResult } | { error: string } {
  try {
    const raw = parseJSON(text) as Record<string, unknown>;
    return {
      result: {
        keyUpdates: toStringArray(raw.keyUpdates, 3),
        risks: toStringArray(raw.risks, 2),
        milestones: toStringArray(raw.milestones, 3),
      },
    };
  } catch {
    return { error: "AI returned an unreadable briefing — please try again." };
  }
}

// ── Card Summary ───────────────────────────────────────────────────────────────

export function normalizeCardSummary(
  text: string,
): { result: CardSummaryResult } | { error: string } {
  try {
    const raw = parseJSON(text) as Record<string, unknown>;
    return {
      result: {
        currentState: String(raw.currentState ?? ""),
        keyDecision:
          raw.keyDecision && raw.keyDecision !== "null"
            ? String(raw.keyDecision)
            : null,
        nextStep:
          raw.nextStep && raw.nextStep !== "null" ? String(raw.nextStep) : null,
      },
    };
  } catch {
    return { error: "AI returned an unreadable summary — please try again." };
  }
}

// ── Query ──────────────────────────────────────────────────────────────────────

export function normalizeQuery(
  text: string,
  /** Lookup map from card id → QueryCard, used to resolve relevantCardIds */
  cardIndex: Map<string, QueryCard>,
): { result: QueryResult } | { error: string } {
  try {
    const raw = parseJSON(text) as Record<string, unknown>;
    const answer = String(raw.answer ?? "");

    const ids: string[] = Array.isArray(raw.relevantCardIds)
      ? (raw.relevantCardIds as unknown[]).map(String).slice(0, 5)
      : [];

    const relevantCards = ids
      .map((id) => cardIndex.get(id))
      .filter((c): c is QueryCard => !!c)
      .map((c) => ({
        id: c.id,
        title: c.title,
        boardId: c.boardId,
        dueDate: c.dueDate ?? null,
        status: c.status ?? null,
      }));

    return { result: { answer, relevantCards } };
  } catch {
    return { error: "AI returned an unreadable response — please try again." };
  }
}
