/** Evaluation from White's point of view. `mate` > 0: White mates in n. */
export interface Score {
  cp?: number;
  mate?: number;
}

export interface EngineLine {
  multipv: number;
  depth: number;
  score: Score;
  /** UCI moves. */
  pv: string[];
}

export interface Analysis {
  fen: string;
  depth: number;
  bestmove: string | null;
  lines: EngineLine[];
}

/** Parses an `info` line. Scores are converted from side-to-move to White's point of view. */
export function parseInfo(line: string, whiteToMove: boolean): EngineLine | null {
  if (!line.startsWith("info") || !line.includes(" pv ")) return null;
  const depth = /\bdepth (\d+)/.exec(line);
  const multipv = /\bmultipv (\d+)/.exec(line);
  const cp = /\bscore cp (-?\d+)/.exec(line);
  const mate = /\bscore mate (-?\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  if (!depth || !pv || (!cp && !mate)) return null;
  // Bound scores (upperbound/lowerbound) are transient: skip them.
  if (/\b(upperbound|lowerbound)\b/.test(line)) return null;
  const sign = whiteToMove ? 1 : -1;
  const score: Score = cp ? { cp: sign * Number(cp[1]) } : { mate: sign * Number(mate![1]) };
  return { multipv: multipv ? Number(multipv[1]) : 1, depth: Number(depth[1]), score, pv: pv[1].trim().split(/\s+/) };
}

/** Score as centipawns for comparisons (mates map to large values, closer mates first). */
export function scoreToCp(s: Score): number {
  if (s.mate !== undefined) {
    if (s.mate === 0) return 0;
    return s.mate > 0 ? 100_000 - s.mate * 100 : -100_000 - s.mate * 100;
  }
  return s.cp ?? 0;
}

/** Win probability for White, 0..100 (lichess model). */
export function winPercent(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : s.mate < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function formatScore(s: Score | undefined): string {
  if (!s) return "…";
  if (s.mate !== undefined) return s.mate === 0 ? "#" : `${s.mate > 0 ? "" : "-"}M${Math.abs(s.mate)}`;
  const v = (s.cp ?? 0) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}
