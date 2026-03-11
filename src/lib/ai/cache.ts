import type { BoardBriefingResult } from "./schemas";

const TTL_MS = 5 * 60 * 1_000; // 5 minutes

type CacheEntry = {
  result: BoardBriefingResult;
  generatedAt: string;
  /** Freshness key at time of caching — invalidate when this changes. */
  activityKey: string;
  expiresAt: number;
};

// Module-level store — lives for the lifetime of the server process.
// Next.js edge/serverless environments may not persist this across requests,
// but the cost of a cache miss is only one extra AI call, which is acceptable.
const store = new Map<string, CacheEntry>();

function key(boardId: string): string {
  return `brief:${boardId}`;
}

/**
 * Returns a cached briefing if it exists, is still fresh (< 5 min old),
 * AND the board's activity key hasn't changed since it was cached.
 */
export function getCachedBrief(
  boardId: string,
  currentActivityKey: string,
): BoardBriefingResult | null {
  const entry = store.get(key(boardId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key(boardId));
    return null;
  }
  if (entry.activityKey !== currentActivityKey) {
    store.delete(key(boardId));
    return null;
  }
  return entry.result;
}

export function setCachedBrief(
  boardId: string,
  activityKey: string,
  result: BoardBriefingResult,
): void {
  store.set(key(boardId), {
    result,
    generatedAt: new Date().toISOString(),
    activityKey,
    expiresAt: Date.now() + TTL_MS,
  });
}

/** Returns the full entry (including generatedAt) for returning in API meta. */
export function getCachedEntry(boardId: string): CacheEntry | null {
  return store.get(key(boardId)) ?? null;
}
