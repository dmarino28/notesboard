import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { extractBearerToken, createUserClient } from "@/lib/supabaseServer";
import type { SearchCard, SearchGroup, SearchResponse, SearchFilters } from "@/lib/search";

// ── Supabase client resolution ────────────────────────────────────────────────
// Try cookie auth (web) then Bearer (Outlook add-in), then fall back to anon.
// Notes are readable by anon per existing RLS; authed users also see their private notes.

async function getSearchClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const cookieClient = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) => {
        try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* no-op outside mutable context */ }
      },
    },
  });

  const { data: { user } } = await cookieClient.auth.getUser();
  if (user) return cookieClient;

  // Anon fallback — still respects RLS for publicly readable notes
  return createServerClient(url, anonKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

// ── POST /api/search ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Bearer token override (Outlook add-in)
  const bearerToken = extractBearerToken(req.headers.get("authorization"));
  const client = bearerToken
    ? createUserClient(bearerToken)
    : await getSearchClient();

  let body: { query?: string; filters?: SearchFilters };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawQuery = (body.query ?? "").trim();
  if (!rawQuery) {
    return NextResponse.json({ groups: [], total: 0 } satisfies SearchResponse);
  }

  const filters: SearchFilters = body.filters ?? {};

  // ── 1. Full-text search on notes ─────────────────────────────────────────────
  // .textSearch with type:'plain' maps to plainto_tsquery('english', query).
  // Returns at most 200 rows, ordered by updated_at DESC (fallback: created_at).

  const noteQuery = client
    .from("notes")
    .select(
      "id, content, description, due_date, status, updated_at, created_at, last_public_activity_at, archived",
    )
    .textSearch("search_vector", rawQuery, { type: "plain", config: "english" })
    .eq("archived", false)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: notesData, error: notesError } = await noteQuery;

  if (notesError) {
    // If search_vector column doesn't exist yet (migration not applied), return empty gracefully
    if (notesError.message.includes("search_vector") || notesError.code === "42703") {
      return NextResponse.json({ groups: [], total: 0 } satisfies SearchResponse);
    }
    console.error("[/api/search] notes query error:", notesError);
    return NextResponse.json({ error: notesError.message }, { status: 500 });
  }

  const notes = (notesData ?? []) as {
    id: string;
    content: string;
    description: string | null;
    due_date: string | null;
    status: string | null;
    updated_at: string | null;
    last_public_activity_at: string | null;
    archived: boolean;
  }[];

  if (notes.length === 0) {
    return NextResponse.json({ groups: [], total: 0 } satisfies SearchResponse);
  }

  const noteIds = notes.map((n) => n.id);
  const noteMap = new Map(notes.map((n) => [n.id, n]));

  // ── 2. Placements for found notes (one query) ─────────────────────────────────
  let placementsQuery = client
    .from("note_placements")
    .select("id, note_id, board_id, column_id")
    .in("note_id", noteIds);

  // Apply board filter at DB level for efficiency
  if (filters.boardId) placementsQuery = placementsQuery.eq("board_id", filters.boardId);
  if (filters.columnId) placementsQuery = placementsQuery.eq("column_id", filters.columnId);

  const { data: placementsData } = await placementsQuery;
  const placements = (placementsData ?? []) as {
    id: string;
    note_id: string;
    board_id: string;
    column_id: string;
  }[];

  // ── 3. Board + column names (one query each) ──────────────────────────────────
  const boardIds = [...new Set(placements.map((p) => p.board_id))];
  const columnIds = [...new Set(placements.map((p) => p.column_id))];

  const [boardsResult, columnsResult] = await Promise.all([
    boardIds.length > 0
      ? client.from("boards").select("id, name").in("id", boardIds)
      : { data: [] },
    columnIds.length > 0
      ? client.from("columns").select("id, name").in("id", columnIds)
      : { data: [] },
  ]);

  const boardMap = new Map(
    ((boardsResult.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b]),
  );
  const columnMap = new Map(
    ((columnsResult.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c]),
  );

  // ── 4. Group: board → column → notes ─────────────────────────────────────────
  // Key: `${board_id}:${column_id}` — one group per board+column pair.
  // Notes with no placements (inbox) go into a null:null group.

  type GroupKey = string; // `${board_id}:${column_id}` or "inbox"
  const groupMap = new Map<GroupKey, { board_id: string | null; column_id: string | null; cards: SearchCard[] }>();

  // Determine which note_ids have placements (may be filtered down)
  const placedNoteIds = new Set(placements.map((p) => p.note_id));

  // Notes that have placements in the filtered set
  for (const placement of placements) {
    const note = noteMap.get(placement.note_id);
    if (!note) continue;

    const key: GroupKey = `${placement.board_id}:${placement.column_id}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { board_id: placement.board_id, column_id: placement.column_id, cards: [] });
    }
    groupMap.get(key)!.cards.push({
      note_id: note.id,
      placement_id: placement.id,
      content: note.content,
      description: note.description,
      due_date: note.due_date,
      status: note.status,
      updated_at: note.updated_at,
      last_public_activity_at: note.last_public_activity_at,
      archived: note.archived,
    });
  }

  // Inbox notes: only include if no filters applied (board/column filters exclude them)
  if (!filters.boardId && !filters.columnId) {
    for (const note of notes) {
      if (!placedNoteIds.has(note.id)) {
        const key: GroupKey = "inbox";
        if (!groupMap.has(key)) {
          groupMap.set(key, { board_id: null, column_id: null, cards: [] });
        }
        groupMap.get(key)!.cards.push({
          note_id: note.id,
          placement_id: null,
          content: note.content,
          description: note.description,
          due_date: note.due_date,
          status: note.status,
          updated_at: note.updated_at,
          last_public_activity_at: note.last_public_activity_at,
          archived: note.archived,
        });
      }
    }
  }

  // ── 5. Build SearchGroup[] structure: merge column groups under boards ────────
  // board_id → Map<column_id, SearchVertical>
  type BoardAccum = Map<string | null, Map<string | null, SearchCard[]>>;
  const boardAccum: BoardAccum = new Map();

  for (const [, { board_id, column_id, cards }] of groupMap) {
    if (!boardAccum.has(board_id)) boardAccum.set(board_id, new Map());
    boardAccum.get(board_id)!.set(column_id, cards);
  }

  const groups: SearchGroup[] = [];

  for (const [board_id, verticalMap] of boardAccum) {
    const board = board_id ? (boardMap.get(board_id) ?? null) : null;

    const verticals: SearchGroup["verticals"] = [];
    for (const [column_id, cards] of verticalMap) {
      const column = column_id ? (columnMap.get(column_id) ?? null) : null;
      // Sort cards within each vertical by updated_at DESC
      const sorted = [...cards].sort((a, b) => {
        if (a.updated_at && b.updated_at) return b.updated_at.localeCompare(a.updated_at);
        if (a.updated_at) return -1;
        if (b.updated_at) return 1;
        return 0;
      });
      verticals.push({ column, cards: sorted });
    }

    // Sort verticals by most recent card
    verticals.sort((a, b) => {
      const aTime = a.cards[0]?.updated_at ?? null;
      const bTime = b.cards[0]?.updated_at ?? null;
      if (aTime && bTime) return bTime.localeCompare(aTime);
      if (aTime) return -1;
      if (bTime) return 1;
      return 0;
    });

    const latestUpdatedAt = verticals[0]?.cards[0]?.updated_at ?? null;
    groups.push({
      board: board ? { id: board.id, name: board.name } : null,
      verticals,
      latestUpdatedAt,
    });
  }

  // Sort groups (boards) by most recent card
  groups.sort((a, b) => {
    if (a.latestUpdatedAt && b.latestUpdatedAt)
      return b.latestUpdatedAt.localeCompare(a.latestUpdatedAt);
    if (a.latestUpdatedAt) return -1;
    if (b.latestUpdatedAt) return 1;
    return 0;
  });

  // Inbox group goes last
  const inboxIdx = groups.findIndex((g) => g.board === null);
  if (inboxIdx > 0) {
    const [inbox] = groups.splice(inboxIdx, 1);
    groups.push(inbox);
  }

  const total = notes.length;
  return NextResponse.json({ groups, total } satisfies SearchResponse);
}
