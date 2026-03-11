import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { buildCardSummaryContext } from "@/lib/ai/context-builders";
import { buildCardSummarySystem, buildCardSummaryUser } from "@/lib/ai/prompts";
import { CARD_SUMMARY } from "@/lib/ai/token-budget";
import { callAI } from "@/lib/ai/provider";
import { normalizeCardSummary } from "@/lib/ai/result-normalizers";

type RequestBody = { cardId?: string };

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

  const { cardId } = body;
  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  // ── Build context ─────────────────────────────────────────────────────────────
  const ctxResult = await buildCardSummaryContext(cardId, client);
  if ("error" in ctxResult) {
    return NextResponse.json({ ok: false, error: ctxResult.error }, { status: 404 });
  }
  const ctx = ctxResult;

  // ── Token budget guard ────────────────────────────────────────────────────────
  const systemPrompt = buildCardSummarySystem();
  const userMessage = buildCardSummaryUser(ctx);
  const totalChars = systemPrompt.length + userMessage.length;

  if (totalChars > CARD_SUMMARY.HARD_PAYLOAD_CHAR_LIMIT) {
    return NextResponse.json(
      { ok: false, error: "Card history is too long to summarize. Try again later." },
      { status: 422 },
    );
  }

  // ── AI call ───────────────────────────────────────────────────────────────────
  const aiResult = await callAI(systemPrompt, userMessage, 384);
  if ("error" in aiResult) {
    return NextResponse.json({ ok: false, error: aiResult.error }, { status: 502 });
  }

  // ── Normalize ─────────────────────────────────────────────────────────────────
  const normalized = normalizeCardSummary(aiResult.text);
  if ("error" in normalized) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    summary: normalized.result,
    meta: {
      cardId,
      generatedAt: new Date().toISOString(),
    },
  });
}
