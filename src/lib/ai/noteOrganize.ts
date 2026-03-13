/**
 * noteOrganize.ts
 *
 * AI organize notes: prompt builders, schema, and result normalizer.
 *
 * Safety guarantee: AI only produces suggestions (review-first).
 * Nothing in this file mutates boards or cards.
 */

import type { NoteEntryWithSignals } from "../noteEntries";
import type { BoardRow } from "../boards";
import type { ColumnRow } from "../columns";

// ─── Suggestion Types ─────────────────────────────────────────────────────────

export type SuggestionType =
  | "create_card"
  | "update_card"
  | "update_board_metadata"
  | "add_milestone"
  | "attach_note_reference";

export interface AISuggestion {
  /** Client-side temporary ID for React key / tracking. */
  localId: string;
  type: SuggestionType;

  // Target identifiers (resolved from AI output against live board/card data)
  targetBoardId: string | null;
  targetBoardName: string;
  targetNoteId: string | null;    // existing card to update
  targetColumnId: string | null;
  targetColumnName: string | null;

  /** Source entry IDs this suggestion was derived from. */
  sourceEntryIds: string[];

  /** Human-readable summary shown to the user in the review UI. */
  description: string;

  // Payload for applying the suggestion
  cardContent?: string;         // for create_card / update_card
  cardDescription?: string;     // for create_card
  milestoneField?: string;      // for add_milestone: board field name
  milestoneValue?: string;      // for add_milestone: ISO date or text

  // Confidence (low/medium/high) — displayed in review UI
  confidence: "low" | "medium" | "high";

  /** Review status — managed in React state. */
  status: "pending" | "applied" | "ignored";
}

// ─── Raw AI Output Schema ─────────────────────────────────────────────────────
// The AI must return JSON matching this shape.

interface RawSuggestion {
  type: string;
  board_name: string;
  column_name?: string;
  card_title?: string;
  card_description?: string;
  milestone_field?: string;
  milestone_value?: string;
  description: string;
  source_indices: number[]; // indices into the entries array passed to the AI
  confidence: string;
}

interface RawOrganizeResult {
  suggestions: RawSuggestion[];
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

export function buildNotesOrganizeSystem(): string {
  return `You are an AI assistant helping a film marketing team organize their personal notes into actionable board updates.

You receive a list of raw note entries and a list of campaign boards.

Your job is to analyze the notes and produce structured suggestions for how the information could be organized into the boards.

CRITICAL RULES — you MUST follow these exactly:
1. You ONLY produce suggestions. You do NOT modify anything.
2. Suggestions must be review-first. The user confirms before anything is applied.
3. Never invent board names not in the provided list.
4. Never guess card IDs or column IDs — use only the names provided.
5. If you are unsure of the correct board or column, set confidence = "low".
6. One note entry can produce multiple suggestions for different boards.
7. Original note text must be preserved verbatim in card_title or card_description if included.

SUGGESTION TYPES:
- "create_card": create a new card on a board
- "update_card": update an existing card (provide card_title as existing card name to match)
- "update_board_metadata": update a board-level field (phase, release date, etc.)
- "add_milestone": add or update a milestone date on a board
- "attach_note_reference": link note entries as a reference to a board without creating a card

OUTPUT FORMAT: Return ONLY valid JSON. No markdown. No prose.
{
  "suggestions": [
    {
      "type": "create_card",
      "board_name": "Alien",
      "column_name": "Updates",
      "card_title": "Trailer debut week of March 23 + livestream March 22",
      "card_description": "From notes: Alien - trailer debut week of March 23 / livestream event March 22 tbc",
      "description": "Create Alien card: Trailer debut + livestream schedule",
      "source_indices": [0, 1],
      "confidence": "high"
    }
  ]
}`;
}

export function buildNotesOrganizeUser(
  entries: NoteEntryWithSignals[],
  boards: BoardRow[],
  columns: ColumnRow[]
): string {
  const boardList = boards
    .map((b) => `- ${b.name} (id: ${b.id})`)
    .join("\n");

  const columnsByBoard: Record<string, string[]> = {};
  for (const col of columns) {
    if (!columnsByBoard[col.board_id]) columnsByBoard[col.board_id] = [];
    columnsByBoard[col.board_id].push(col.name);
  }

  const boardDetails = boards
    .map((b) => {
      const cols = columnsByBoard[b.id]?.join(", ") ?? "no columns";
      return `${b.name}: [${cols}]`;
    })
    .join("\n");

  const entriesList = entries
    .map((e, i) => {
      const indent = "  ".repeat(e.indent_level);
      const signals = e.signals.map((s) => `${s.signal_type}:${s.normalized_value ?? s.signal_value}`).join(", ");
      return `[${i}] ${indent}${e.content}${signals ? `  [signals: ${signals}]` : ""}`;
    })
    .join("\n");

  return `CAMPAIGN BOARDS:
${boardList}

BOARD COLUMNS:
${boardDetails}

NOTE ENTRIES TO ORGANIZE (indices for source_indices):
${entriesList}

Analyze these notes and return structured suggestions. Focus on entries with clear film/campaign signals. Group related entries when they form a coherent update.`;
}

// ─── Result Normalizer ────────────────────────────────────────────────────────

export function normalizeNotesOrganize(
  rawText: string,
  entries: NoteEntryWithSignals[],
  boards: BoardRow[],
  columns: ColumnRow[]
): AISuggestion[] {
  let parsed: RawOrganizeResult;

  try {
    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    parsed = JSON.parse(cleaned) as RawOrganizeResult;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.suggestions)) return [];

  const boardByName = new Map<string, BoardRow>(
    boards.map((b) => [b.name.toLowerCase(), b])
  );
  const columnByBoardAndName = new Map<string, ColumnRow>();
  for (const col of columns) {
    columnByBoardAndName.set(`${col.board_id}:${col.name.toLowerCase()}`, col);
  }

  const suggestions: AISuggestion[] = [];

  for (const raw of parsed.suggestions) {
    const type = raw.type as SuggestionType;
    if (
      !["create_card", "update_card", "update_board_metadata", "add_milestone", "attach_note_reference"].includes(type)
    ) {
      continue;
    }

    const board = boardByName.get(raw.board_name?.toLowerCase() ?? "");
    const column = board && raw.column_name
      ? columnByBoardAndName.get(`${board.id}:${raw.column_name.toLowerCase()}`)
      : undefined;

    const sourceEntryIds = (raw.source_indices ?? [])
      .filter((i) => typeof i === "number" && i >= 0 && i < entries.length)
      .map((i) => entries[i].id);

    const confidence = ["low", "medium", "high"].includes(raw.confidence)
      ? (raw.confidence as "low" | "medium" | "high")
      : "low";

    suggestions.push({
      localId: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      targetBoardId: board?.id ?? null,
      targetBoardName: raw.board_name ?? "Unknown",
      targetNoteId: null,
      targetColumnId: column?.id ?? null,
      targetColumnName: raw.column_name ?? null,
      sourceEntryIds,
      description: raw.description ?? "",
      cardContent: raw.card_title,
      cardDescription: raw.card_description,
      milestoneField: raw.milestone_field,
      milestoneValue: raw.milestone_value,
      confidence,
      status: "pending",
    });
  }

  return suggestions;
}
