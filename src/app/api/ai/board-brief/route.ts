import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { buildBoardBriefingContext } from "@/lib/ai/context-builders";
import { buildBoardBriefingSystem, buildBoardBriefingUser } from "@/lib/ai/prompts";
import { BOARD_BRIEF } from "@/lib/ai/token-budget";
import { getCachedBrief, setCachedBrief, getCachedEntry } from "@/lib/ai/cache";
import { callAI } from "@/lib/ai/provider";
import { normalizeBoardBriefing } from "@/lib/ai/result-normalizers";

type RequestBody = { boardId?: string };

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

  const { boardId } = body;
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  // ── Build context ─────────────────────────────────────────────────────────────
  const ctxResult = await buildBoardBriefingContext(boardId, client);
  if ("error" in ctxResult) {
    return NextResponse.json({ ok: false, error: ctxResult.error }, { status: 404 });
  }
  const { ctx, activityKey } = ctxResult;

  // ── Cache check ───────────────────────────────────────────────────────────────
  const cached = getCachedBrief(boardId, activityKey);
  if (cached) {
    const entry = getCachedEntry(boardId);
    return NextResponse.json({
      ok: true,
      briefing: cached,
      meta: {
        boardId,
        generatedAt: entry?.generatedAt ?? new Date().toISOString(),
        cached: true,
      },
    });
  }

  // ── Token budget guard ────────────────────────────────────────────────────────
  const systemPrompt = buildBoardBriefingSystem();
  const userMessage = buildBoardBriefingUser(ctx);
  const totalChars = systemPrompt.length + userMessage.length;

  if (totalChars > BOARD_BRIEF.HARD_PAYLOAD_CHAR_LIMIT) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Too much campaign history to summarize in one pass. Try a board with fewer active cards.",
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
  const normalized = normalizeBoardBriefing(aiResult.text);
  if ("error" in normalized) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 502 });
  }

  const generatedAt = new Date().toISOString();
  setCachedBrief(boardId, activityKey, normalized.result);

  return NextResponse.json({
    ok: true,
    briefing: normalized.result,
    meta: { boardId, generatedAt, cached: false },
  });
}
