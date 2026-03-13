"use client";

import type { BoardRow } from "@/lib/boards";

/**
 * Board accent color palette.
 * Stable order: board at index 0 gets color 0, etc.
 * Used for: bullet dot (Tailwind class), inline text color (hex), background tint (hex + opacity).
 */
export const BOARD_ACCENT_COLORS: { hex: string; dot: string }[] = [
  { hex: "#6366f1", dot: "bg-indigo-400" },
  { hex: "#3b82f6", dot: "bg-blue-400" },
  { hex: "#14b8a6", dot: "bg-teal-400" },
  { hex: "#22c55e", dot: "bg-green-400" },
  { hex: "#f97316", dot: "bg-orange-400" },
  { hex: "#ef4444", dot: "bg-red-400" },
  { hex: "#a855f7", dot: "bg-purple-400" },
  { hex: "#ec4899", dot: "bg-pink-400" },
  { hex: "#eab308", dot: "bg-yellow-400" },
  { hex: "#64748b", dot: "bg-slate-400" },
];

/**
 * Resolve the dot class and hex for a board by its index in the board list.
 */
export function getBoardAccentStyle(
  boardId: string,
  boards: BoardRow[]
): { dot: string; hex: string } {
  const idx = boards.findIndex((b) => b.id === boardId);
  const color = BOARD_ACCENT_COLORS[Math.max(0, idx) % BOARD_ACCENT_COLORS.length];
  return { dot: color.dot, hex: color.hex };
}
