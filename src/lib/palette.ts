/** Curated 10-tone label / column color palette. */
export const LABEL_PALETTE = [
  { hex: "#64748b", label: "Slate" },
  { hex: "#6366f1", label: "Indigo" },
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#14b8a6", label: "Teal" },
  { hex: "#22c55e", label: "Green" },
  { hex: "#84cc16", label: "Lime" },
  { hex: "#ca8a04", label: "Yellow" },
  { hex: "#f97316", label: "Orange" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#a855f7", label: "Purple" },
] as const;

export type PaletteTone = (typeof LABEL_PALETTE)[number];
