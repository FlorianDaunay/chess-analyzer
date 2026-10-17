/**
 * Illustration colours: board squares, arrows, move classification. These are fixed and do not
 * follow the UI theme (a chess board must look like a chess board in every theme).
 */
export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  /** Last move / selection highlight. */
  highlight: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "green", name: "Tournament", light: "#ebecd0", dark: "#739552", highlight: "#f5f682b0" },
  { id: "brown", name: "Wood", light: "#f0d9b5", dark: "#b58863", highlight: "#cdd26ab0" },
  { id: "blue", name: "Ice", light: "#dee3e6", dark: "#8ca2ad", highlight: "#9bc700a0" },
  { id: "purple", name: "Amethyst", light: "#e9e2f5", dark: "#8b6fb3", highlight: "#f6c94ab0" },
  { id: "gray", name: "Graphite", light: "#d9d9d9", dark: "#7d7d7d", highlight: "#7fb2e5b0" },
  { id: "coral", name: "Coral", light: "#f6e3d4", dark: "#d0846a", highlight: "#ffe37ab0" },
];

export const ARROW = {
  best: "#15781bcc",
  user: "#e68a00cc",
  alt: "#2a66c2cc",
  bad: "#c0392bcc",
  hint: "#7b3fbfcc",
};

export type MoveClass = "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "miss" | "blunder" | "forced";

export const CLASS_STYLE: Record<MoveClass, { color: string; symbol: string; label: string }> = {
  brilliant: { color: "#1baaa6", symbol: "!!", label: "Brilliant" },
  great: { color: "#5b8bb0", symbol: "!", label: "Great" },
  best: { color: "#81b64c", symbol: "★", label: "Best" },
  excellent: { color: "#96bc4b", symbol: "👍", label: "Excellent" },
  good: { color: "#97af8b", symbol: "✓", label: "Good" },
  book: { color: "#a88865", symbol: "📖", label: "Book" },
  forced: { color: "#97af8b", symbol: "→", label: "Forced" },
  inaccuracy: { color: "#f0c15c", symbol: "?!", label: "Inaccuracy" },
  mistake: { color: "#e6912c", symbol: "?", label: "Mistake" },
  miss: { color: "#ee6b55", symbol: "✗", label: "Miss" },
  blunder: { color: "#ca3431", symbol: "??", label: "Blunder" },
};

/** Fixed colours for white/black/draw in charts (readable on light and dark themes). */
export const RESULT_COLORS = { win: "#4c9a2a", draw: "#8a8f98", loss: "#c8463d" };
export const SIDE_COLORS = { white: "#e8e6e1", black: "#3a3835" };
