import type { BoardBriefingContext, CardSummaryContext, QueryContext } from "./schemas";

// Shared base instruction injected into every system prompt.
const SYSTEM_BASE = `\
You are a campaign management assistant for NotesBoard, a project tracking tool used by film/media teams.
Your role is to help teams quickly understand the current state of their campaigns.

Rules you MUST follow at all times:
- Only reference information that is explicitly present in the data provided. Never invent facts.
- Be concise and operational. Use plain, direct language.
- If data is insufficient to answer a point, write "Not enough context to assess." rather than guessing.
- Never propose status changes, deadline modifications, workflow automation, or any board mutations.
- Return your response as valid JSON matching the exact shape requested. Do not wrap it in markdown fences.
- Do not add fields beyond what is specified in the output schema.`;

// ── Board Briefing ─────────────────────────────────────────────────────────────

export function buildBoardBriefingSystem(): string {
  return `${SYSTEM_BASE}

You will receive structured board context and must return a JSON object with exactly this shape:
{
  "keyUpdates": [<string>, <string>, <string>],
  "risks": [<string>, <string>],
  "milestones": [<string>, <string>, <string>]
}

Field rules:
- keyUpdates: The 3 most important recent developments on this board. Prefer information from the last 7 days.
- risks: The 2 most significant risks or blockers visible in the card data (blocked status, overdue dates, stalled work).
- milestones: The 3 most important upcoming dates or deliverables based on due dates and snapshot fields.

Each value must be a single complete sentence. No bullet sub-lists inside values.
If there is not enough data for a slot, use the string "Not enough context to assess."`;
}

export function buildBoardBriefingUser(ctx: BoardBriefingContext): string {
  const snap = ctx.snapshotFields;

  const lines: string[] = [
    `Board: ${ctx.boardName}`,
    `Campaign Phase: ${snap.campaignPhase ?? "Not set"}`,
    `Release Date: ${snap.releaseDate ?? "Not set"}`,
    `Premiere Date: ${snap.premiereDate ?? "Not set"}`,
    `Trailer Debut Date: ${snap.trailerDate ?? "Not set"}`,
    `Key Markets: ${snap.keyMarkets ?? "Not set"}`,
  ];
  if (snap.snapshotNotes) lines.push(`Snapshot Notes: ${snap.snapshotNotes}`);
  lines.push("", `Active cards (${ctx.cards.length} shown, priority-ranked):`);

  for (const card of ctx.cards) {
    const flags: string[] = [];
    if (card.status === "blocked") flags.push("BLOCKED");
    else if (card.status === "at_risk") flags.push("AT RISK");
    if (card.isHighlighted) flags.push("pinned");
    const dueStr = card.dueDate ? ` | due ${card.dueDate}` : "";
    const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
    lines.push(`  • [${card.columnName}] ${card.title}${dueStr}${flagStr}`);
    for (const upd of card.recentUpdates) {
      lines.push(`      > ${upd}`);
    }
  }

  return lines.join("\n");
}

// ── Card Summary ───────────────────────────────────────────────────────────────

export function buildCardSummarySystem(): string {
  return `${SYSTEM_BASE}

You will receive card data and must return a JSON object with exactly this shape:
{
  "currentState": <string>,
  "keyDecision": <string | null>,
  "nextStep": <string | null>
}

Field rules:
- currentState: 1–2 sentences describing what this card is tracking and its current status. Ground it in the data.
- keyDecision: The most important decision or outcome recorded in the update history, if clearly detectable. Use null if not found.
- nextStep: The most important next action implied by the most recent updates, if clearly detectable. Use null if not found.

Do not invent information not present in the data. For null fields, output the JSON null value, not the string "null".`;
}

export function buildCardSummaryUser(ctx: CardSummaryContext): string {
  const lines: string[] = [
    `Card: ${ctx.title}`,
    `Status: ${ctx.status ?? "None"}`,
    ctx.dueDate ? `Due: ${ctx.dueDate}` : "Due: Not set",
    ctx.description ? `Description: ${ctx.description}` : "",
    "",
    `Update history (most recent first, ${ctx.recentUpdates.length} entries):`,
  ].filter((l) => l !== "");

  if (ctx.recentUpdates.length === 0) {
    lines.push("  (no updates recorded)");
  } else {
    for (const upd of ctx.recentUpdates) {
      let line = `  [${upd.createdAt.slice(0, 10)}] ${upd.content}`;
      if (upd.statusChange) line += ` (status → ${upd.statusChange})`;
      lines.push(line);
    }
  }

  return lines.join("\n");
}

// ── Ask the Board ──────────────────────────────────────────────────────────────

export function buildQuerySystem(): string {
  return `${SYSTEM_BASE}

You will receive a user question and a set of relevant cards from a project board.
You must return a JSON object with exactly this shape:
{
  "answer": <string>,
  "relevantCardIds": [<string>, ...]
}

Field rules:
- answer: A concise, direct response to the question based only on the provided card data. 2–4 sentences maximum.
  Use grounding language like "Based on the available data…" or "The card history shows…".
  If the question cannot be answered from the provided data, say so directly. Do not guess.
- relevantCardIds: An array of card IDs from the provided data that are most directly relevant to the question.
  Maximum 5 IDs. Use an empty array [] if no specific cards are relevant.

Never fabricate card IDs. Only use IDs from the data provided.`;
}

export function buildQueryUser(ctx: QueryContext): string {
  const lines: string[] = [
    `Question: "${ctx.question}"`,
    ctx.boardName
      ? `Board context: ${ctx.boardName}`
      : "Board context: All boards",
    "",
    `Relevant cards (${ctx.cards.length}):`,
  ];

  for (const card of ctx.cards) {
    const location = [card.boardName, card.columnName].filter(Boolean).join(" / ");
    let line = `  • id:${card.id} | ${card.title}`;
    if (location) line += ` | [${location}]`;
    if (card.status) line += ` | status:${card.status}`;
    if (card.dueDate) line += ` | due:${card.dueDate}`;
    if (card.recentActivity) line += `\n      last activity: ${card.recentActivity}`;
    lines.push(line);
  }

  return lines.join("\n");
}
