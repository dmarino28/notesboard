import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BoardBriefingContext,
  BriefingCard,
  CardSummaryContext,
  QueryContext,
  QueryCard,
} from "./schemas";
import { BOARD_BRIEF, CARD_SUMMARY, QUERY, trimToChars } from "./token-budget";

// ── Shared helpers ─────────────────────────────────────────────────────────────

type RawNote = {
  id: string;
  content: string;
  description: string | null;
  due_date: string | null;
  status: string | null;
  highlight_on_snapshot: boolean;
  last_public_activity_at: string | null;
  last_public_activity_preview: string | null;
  updated_at: string | null;
  archived: boolean;
};

// Supabase returns joined rows as object or single-element array depending on FK direction.
function resolveOne<T>(val: T | T[] | null): T | null {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

// ── Board Briefing ─────────────────────────────────────────────────────────────

type BoardRow = {
  id: string;
  name: string;
  campaign_phase: string | null;
  release_date: string | null;
  premiere_date: string | null;
  trailer_debut_date: string | null;
  key_markets: string | null;
  snapshot_notes: string | null;
};

type BriefPlacementRaw = {
  note_id: string;
  column_id: string;
  notes: RawNote | RawNote[] | null;
};

type UpdateRow = {
  note_id: string;
  content: string;
  status_change: string | null;
  created_at: string;
};

/**
 * Fetches and assembles all context needed for the board briefing prompt.
 * Returns the assembled context plus an `activityKey` string used for cache
 * invalidation (the most recent `updated_at` across included cards).
 */
export async function buildBoardBriefingContext(
  boardId: string,
  client: SupabaseClient,
): Promise<{ ctx: BoardBriefingContext; activityKey: string } | { error: string }> {
  // 1. Board snapshot fields
  const { data: boardRaw, error: boardErr } = await client
    .from("boards")
    .select(
      "id, name, campaign_phase, release_date, premiere_date, trailer_debut_date, key_markets, snapshot_notes",
    )
    .eq("id", boardId)
    .maybeSingle();

  if (boardErr || !boardRaw) {
    return { error: boardErr?.message ?? "Board not found" };
  }
  const board = boardRaw as BoardRow;

  // 2. Columns — needed to resolve column names
  const { data: columnsRaw } = await client
    .from("columns")
    .select("id, name")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  const columnMap = new Map<string, string>(
    ((columnsRaw ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  // 3. Placements with joined note data (non-archived)
  const { data: placementsRaw, error: placementsErr } = await client
    .from("note_placements")
    .select(
      "note_id, column_id, notes(id, content, description, due_date, status, highlight_on_snapshot, last_public_activity_at, updated_at, archived)",
    )
    .eq("board_id", boardId);

  if (placementsErr) return { error: placementsErr.message };

  const allPlacements = ((placementsRaw ?? []) as BriefPlacementRaw[])
    .map((p) => ({ ...p, note: resolveOne(p.notes) }))
    .filter((p): p is typeof p & { note: RawNote } => !!p.note && !p.note.archived);

  // Compute cache invalidation key from most-recent updated_at
  const activityKey =
    allPlacements
      .map((p) => p.note.updated_at ?? p.note.last_public_activity_at ?? "")
      .sort()
      .reverse()[0] ?? "";

  // 4. Priority-rank cards: blocked > overdue > highlighted > recently active
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function priorityScore(note: RawNote): number {
    let score = 0;
    if (note.status === "blocked") score += 100;
    if (note.status === "at_risk") score += 50;
    if (note.due_date && new Date(note.due_date) < today) score += 60;
    if (note.highlight_on_snapshot) score += 25;
    if (note.last_public_activity_at) {
      const daysSince =
        (Date.now() - new Date(note.last_public_activity_at).getTime()) / 86_400_000;
      if (daysSince < 3) score += 20;
      else if (daysSince < 7) score += 12;
      else if (daysSince < 14) score += 6;
    }
    return score;
  }

  const ranked = allPlacements
    .slice() // avoid mutating
    .sort((a, b) => priorityScore(b.note) - priorityScore(a.note))
    .slice(0, BOARD_BRIEF.MAX_CARDS);

  const noteIds = ranked.map((p) => p.note_id);

  // 5. Recent updates for selected notes
  const { data: updatesRaw } = noteIds.length
    ? await client
        .from("note_updates")
        .select("note_id, content, status_change, created_at")
        .in("note_id", noteIds)
        .order("created_at", { ascending: false })
        .limit(noteIds.length * BOARD_BRIEF.MAX_UPDATES_PER_CARD)
    : { data: [] };

  const updatesByNote = new Map<string, UpdateRow[]>();
  for (const u of (updatesRaw ?? []) as UpdateRow[]) {
    const arr = updatesByNote.get(u.note_id) ?? [];
    if (arr.length < BOARD_BRIEF.MAX_UPDATES_PER_CARD) {
      arr.push(u);
      updatesByNote.set(u.note_id, arr);
    }
  }

  // 6. Assemble
  const cards: BriefingCard[] = ranked.map((p) => ({
    id: p.note_id,
    title: trimToChars(p.note.content, 100),
    status: p.note.status,
    dueDate: p.note.due_date,
    isHighlighted: p.note.highlight_on_snapshot,
    columnName: columnMap.get(p.column_id) ?? "Unknown",
    recentUpdates: (updatesByNote.get(p.note_id) ?? []).map((u) =>
      trimToChars(u.content, BOARD_BRIEF.MAX_UPDATE_CHARS),
    ),
  }));

  const ctx: BoardBriefingContext = {
    boardId,
    boardName: board.name,
    snapshotFields: {
      campaignPhase: board.campaign_phase,
      releaseDate: board.release_date,
      premiereDate: board.premiere_date,
      trailerDate: board.trailer_debut_date,
      keyMarkets: board.key_markets,
      snapshotNotes: board.snapshot_notes,
    },
    cards,
  };

  return { ctx, activityKey };
}

// ── Card Summary ───────────────────────────────────────────────────────────────

type CardNoteRow = {
  content: string;
  description: string | null;
  due_date: string | null;
  status: string | null;
};

type CardUpdateRow = {
  content: string;
  status_change: string | null;
  created_at: string;
};

export async function buildCardSummaryContext(
  noteId: string,
  client: SupabaseClient,
): Promise<CardSummaryContext | { error: string }> {
  const { data: noteRaw, error: noteErr } = await client
    .from("notes")
    .select("content, description, due_date, status")
    .eq("id", noteId)
    .maybeSingle();

  if (noteErr || !noteRaw) {
    return { error: noteErr?.message ?? "Card not found" };
  }
  const note = noteRaw as CardNoteRow;

  const { data: updatesRaw } = await client
    .from("note_updates")
    .select("content, status_change, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .limit(CARD_SUMMARY.MAX_UPDATES);

  return {
    noteId,
    title: note.content,
    description: note.description
      ? trimToChars(note.description, CARD_SUMMARY.MAX_DESCRIPTION_CHARS)
      : null,
    dueDate: note.due_date,
    status: note.status,
    recentUpdates: ((updatesRaw ?? []) as CardUpdateRow[]).map((u) => ({
      content: trimToChars(u.content, CARD_SUMMARY.MAX_UPDATE_CHARS),
      statusChange: u.status_change,
      createdAt: u.created_at,
    })),
  };
}

// ── Ask the Board ──────────────────────────────────────────────────────────────

type QueryPlacementRaw = {
  note_id: string;
  board_id: string;
  column_id: string;
  notes: RawNote | RawNote[] | null;
};

/**
 * Builds query context by:
 * 1. Resolving board + column names
 * 2. Fetching non-archived placements (scoped to boardId if provided)
 * 3. Keyword-scoring cards against the question
 * 4. Returning the top MAX_CARDS by relevance (fallback: most recently active)
 */
export async function buildQueryContext(
  question: string,
  boardId: string | undefined,
  client: SupabaseClient,
): Promise<{ ctx: QueryContext; cardIndex: Map<string, QueryCard> } | { error: string }> {
  // 1. Resolve board name(s)
  let boardName: string | undefined;
  if (boardId) {
    const { data: b } = await client
      .from("boards")
      .select("name")
      .eq("id", boardId)
      .maybeSingle();
    boardName = (b as { name: string } | null)?.name;
  }

  // Fetch column names (scoped to board if provided)
  let colQuery = client.from("columns").select("id, name");
  if (boardId) colQuery = colQuery.eq("board_id", boardId);
  const { data: columnsRaw } = await colQuery;
  const columnMap = new Map<string, string>(
    ((columnsRaw ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  // Board names for multi-board queries
  const { data: boardsRaw } = await client.from("boards").select("id, name");
  const boardMap = new Map<string, string>(
    ((boardsRaw ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]),
  );

  // 2. Fetch placements
  let placementsQuery = client
    .from("note_placements")
    .select(
      "note_id, board_id, column_id, notes(id, content, description, due_date, status, last_public_activity_at, last_public_activity_preview, archived)",
    );
  if (boardId) placementsQuery = placementsQuery.eq("board_id", boardId);

  const { data: placementsRaw, error: placementsErr } = await placementsQuery;
  if (placementsErr) return { error: placementsErr.message };

  const active = ((placementsRaw ?? []) as QueryPlacementRaw[])
    .map((p) => ({ ...p, note: resolveOne(p.notes) }))
    .filter((p): p is typeof p & { note: RawNote } => !!p.note && !p.note.archived);

  // 3. Keyword scoring
  const STOPWORDS = new Set([
    "what", "is", "are", "the", "this", "of", "on", "for", "from", "to", "in", "at",
    "a", "an", "and", "or", "its", "we", "us", "our", "with", "has", "have", "been",
    "was", "were", "that", "which", "when", "where", "how", "why", "can", "do",
  ]);

  const keywords = question
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  function relevanceScore(note: RawNote): number {
    if (keywords.length === 0) return 0;
    const haystack = [
      note.content,
      note.description ?? "",
      note.last_public_activity_preview ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return keywords.filter((kw) => haystack.includes(kw)).length;
  }

  const scored = active
    .map((p) => ({ p, score: relevanceScore(p.note) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, QUERY.MAX_CARDS)
    .map(({ p }) => p);

  // Fallback: most recently active cards when no keyword matches
  const candidates =
    scored.length > 0
      ? scored
      : active
          .sort((a, b) => {
            const at = a.note.last_public_activity_at ?? "";
            const bt = b.note.last_public_activity_at ?? "";
            return bt.localeCompare(at);
          })
          .slice(0, QUERY.MAX_CARDS);

  // 4. Build QueryCard list and index
  const cards: QueryCard[] = candidates.map((p) => ({
    id: p.note_id,
    title: p.note.content,
    boardId: p.board_id,
    boardName: boardMap.get(p.board_id),
    columnName: columnMap.get(p.column_id),
    status: p.note.status,
    dueDate: p.note.due_date,
    recentActivity: p.note.last_public_activity_preview
      ? trimToChars(p.note.last_public_activity_preview, QUERY.MAX_ACTIVITY_CHARS)
      : null,
  }));

  const cardIndex = new Map<string, QueryCard>(cards.map((c) => [c.id, c]));

  return {
    ctx: { question, boardId, boardName, cards },
    cardIndex,
  };
}
