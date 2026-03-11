import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { buildQueryContext } from "@/lib/ai/context-builders";
import { buildQuerySystem, buildQueryUser } from "@/lib/ai/prompts";
import { QUERY } from "@/lib/ai/token-budget";
import { callAI } from "@/lib/ai/provider";
import { normalizeQuery } from "@/lib/ai/result-normalizers";

type RequestBody = {
  query?: string;
  boardId?: string;
};

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client } = auth;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { query, boardId } = body;
  if (!query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });
  if (query.trim().length > 300) {
    return NextResponse.json(
      { error: "Query is too long (max 300 characters)." },
      { status: 400 },
    );
  }

  // ── Build context ─────────────────────────────────────────────────────────────
  const ctxResult = await buildQueryContext(query.trim(), boardId, client);
  if ("error" in ctxResult) {
    return NextResponse.json({ ok: false, error: ctxResult.error }, { status: 500 });
  }
  const { ctx, cardIndex } = ctxResult;

  if (ctx.cards.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        answer: "No matching cards found for that question.",
        relevantCards: [],
        meta: { boardId, generatedAt: new Date().toISOString() },
      },
    );
  }

  // ── Token budget guard ────────────────────────────────────────────────────────
  const systemPrompt = buildQuerySystem();
  const userMessage = buildQueryUser(ctx);
  const totalChars = systemPrompt.length + userMessage.length;

  if (totalChars > QUERY.HARD_PAYLOAD_CHAR_LIMIT) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many results to process. Try narrowing your question to a specific board.",
      },
      { status: 422 },
    );
  }

  // ── AI call ───────────────────────────────────────────────────────────────────
  const aiResult = await callAI(systemPrompt, userMessage, 512);
  if ("error" in aiResult) {
    return NextResponse.json({ ok: false, error: aiResult.error }, { status: 502 });
  }

  // ── Normalize ─────────────────────────────────────────────────────────────────
  const normalized = normalizeQuery(aiResult.text, cardIndex);
  if ("error" in normalized) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    answer: normalized.result.answer,
    relevantCards: normalized.result.relevantCards,
    meta: {
      boardId,
      generatedAt: new Date().toISOString(),
    },
  });
}
