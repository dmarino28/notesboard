"use client";

// NOTE: Despite the filename "ContextBadge", this file exports only board color
// utilities (BOARD_ACCENT_COLORS, resolveBoardHex, getBoardAccentStyle).
// There is no visual badge component here. Consider renaming to boardColors.ts
// if this module is ever moved or refactored.

import type { BoardRow } from "@/lib/boards";

/**
 * Board accent color palette.
 * Used for: bullet dot (Tailwind class), inline text color (hex), background tint (hex + opacity).
 */
export const BOARD_ACCENT_COLORS: { hex: string; dot: string }[] = [
  { hex: "#6366f1", dot: "bg-indigo-400" },
  { hex: "#3b82f6", dot: "bg-blue-400" },
  { hex: "#14b8a6", dot: "bg-teal-400" },
  { hex: "#22c55e", dot: "bg-green-400" },
  { hex: "#f97316", dot: "bg-orange-400" },
  { hex: "#a855f7", dot: "bg-purple-400" },
  { hex: "#ec4899", dot: "bg-pink-400" },
  { hex: "#eab308", dot: "bg-yellow-400" },
  { hex: "#06b6d4", dot: "bg-cyan-400" },
  { hex: "#64748b", dot: "bg-slate-400" },
];

/**
 * Deterministic hash of a string to an index in [0, range).
 * Stable regardless of how boards are ordered in the list.
 */
function hashToIndex(str: string, range: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % range;
}

/**
 * Resolve the hex color for a board.
 * Priority: board.color field (if ever added to schema) → deterministic hash of board.id.
 * Returns null when boardId is null/not found.
 */
export function resolveBoardHex(boardId: string | null, boards: BoardRow[]): string | null {
  if (!boardId) return null;
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  const idx = hashToIndex(boardId, BOARD_ACCENT_COLORS.length);
  return BOARD_ACCENT_COLORS[idx].hex;
}

/**
 * Resolve dot class + hex for a board. Uses hash-based index (stable across list reorders).
 */
export function getBoardAccentStyle(
  boardId: string,
  boards: BoardRow[]
): { dot: string; hex: string } {
  const idx = hashToIndex(boardId, BOARD_ACCENT_COLORS.length);
  const color = BOARD_ACCENT_COLORS[idx];
  return { dot: color.dot, hex: color.hex };
}
