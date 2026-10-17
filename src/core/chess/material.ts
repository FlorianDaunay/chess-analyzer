import type { Color } from "./rules";

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

export interface MaterialInfo {
  /** Pieces captured BY each side (lowercase types), most valuable first. */
  captured: Record<Color, string[]>;
  /** Material advantage of White in pawns. */
  diff: number;
}

export function materialOf(fen: string): MaterialInfo {
  const counts: Record<Color, Record<string, number>> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  let score = 0;
  for (const ch of fen.split(" ")[0]) {
    if (!/[pnbrqkPNBRQK]/.test(ch)) continue;
    const color: Color = ch === ch.toUpperCase() ? "w" : "b";
    const t = ch.toLowerCase();
    if (t !== "k") counts[color][t] += 1;
    score += (color === "w" ? 1 : -1) * VALUE[t];
  }
  const order = ["q", "r", "b", "n", "p"];
  const capturedBy = (by: Color): string[] => {
    const victim = by === "w" ? "b" : "w";
    // Promotions can make counts exceed the start: clamp at 0.
    return order.flatMap((t) => Array(Math.max(0, START[t] - counts[victim][t])).fill(t));
  };
  return { captured: { w: capturedBy("w"), b: capturedBy("b") }, diff: score };
}

export function pieceValue(type: string) {
  return VALUE[type] ?? 0;
}
