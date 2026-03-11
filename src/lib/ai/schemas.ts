// ── AI input context shapes ────────────────────────────────────────────────────

export type BriefingCard = {
  id: string;
  title: string;
  status: string | null;
  dueDate: string | null;
  isHighlighted: boolean;
  columnName: string;
  recentUpdates: string[];
};

export type BoardBriefingContext = {
  boardId: string;
  boardName: string;
  snapshotFields: {
    campaignPhase: string | null;
    releaseDate: string | null;
    premiereDate: string | null;
    trailerDate: string | null;
    keyMarkets: string | null;
    snapshotNotes: string | null;
  };
  cards: BriefingCard[];
};

export type CardSummaryContext = {
  noteId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string | null;
  recentUpdates: Array<{
    content: string;
    statusChange: string | null;
    createdAt: string;
  }>;
};

export type QueryCard = {
  id: string;
  title: string;
  boardId: string;
  boardName: string | undefined;
  columnName: string | undefined;
  status: string | null;
  dueDate: string | null;
  recentActivity: string | null;
};

export type QueryContext = {
  question: string;
  boardId: string | undefined;
  boardName: string | undefined;
  cards: QueryCard[];
};

// ── AI output shapes ───────────────────────────────────────────────────────────

export type BoardBriefingResult = {
  keyUpdates: string[];
  risks: string[];
  milestones: string[];
};

export type CardSummaryResult = {
  currentState: string;
  keyDecision: string | null;
  nextStep: string | null;
};

export type QueryResult = {
  answer: string;
  relevantCards: Array<{
    id: string;
    title: string;
    boardId: string;
    dueDate: string | null;
    status: string | null;
  }>;
};
