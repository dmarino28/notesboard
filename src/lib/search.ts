// Types for Bucket 5 – global search system.
// "Film" maps to Board, "Vertical/List" maps to Column, "Market" is omitted (no such column).

export type SearchFilters = {
  boardId?: string;
  columnId?: string;
};

/** A single note card in search results — flattened from notes row */
export type SearchCard = {
  note_id: string;
  placement_id: string | null;  // null for inbox notes (no placement)
  content: string;
  description: string | null;
  due_date: string | null;
  status: string | null;
  updated_at: string | null;
  last_public_activity_at: string | null;
  archived: boolean;
};

/** Notes grouped within a column */
export type SearchVertical = {
  column: { id: string; name: string } | null;  // null = inbox (no placement)
  cards: SearchCard[];
};

/** Notes grouped by board → column */
export type SearchGroup = {
  board: { id: string; name: string } | null;  // null = inbox
  verticals: SearchVertical[];
  /** ISO string of most recent updated_at within the group, for sorting */
  latestUpdatedAt: string | null;
};

export type SearchResponse = {
  groups: SearchGroup[];
  /** Total notes found before filtering/grouping */
  total: number;
};
