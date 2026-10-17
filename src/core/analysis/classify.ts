import { Chess, type Square } from "chess.js";
import type { Color } from "../chess/rules";
import { pieceValue } from "../chess/material";
import { type Score, scoreToCp, winPercent } from "../engine/uci";
import type { MoveClass } from "@/ui/palette";

/** Engine view of one position. */
export interface PositionEval {
  score: Score;
  /** Best move (UCI), null in terminal positions. */
  best: string | null;
  /** Best line from this position (UCI). */
  pv: string[];
  /** Score of the second-best move (for "only move" detection). */
  second?: Score;
}

export interface MoveAnalysis {
  ply: number;
  uci: string;
  san: string;
  color: Color;
  /** Position before the move. */
  fenBefore: string;
  /** Eval before the move (best play) and after the played move. White's point of view. */
  before: Score;
  after: Score;
  best: string | null;
  bestPv: string[];
  /** Win% lost by the mover (0..100). */
  wpLoss: number;
  /** Centipawns lost by the mover (capped at 1000). */
  cpLoss: number;
  accuracy: number;
  cls: MoveClass;
  phase: Phase;
}

export type Phase = "opening" | "middlegame" | "endgame";

export interface GameAnalysis {
  id: string;
  version: number;
  depth: number;
  startFen: string;
  positions: PositionEval[];
  moves: MoveAnalysis[];
  accuracy: Record<Color, number>;
  acpl: Record<Color, number>;
  counts: Record<Color, Partial<Record<MoveClass, number>>>;
  phaseAccuracy: Record<Color, Partial<Record<Phase, number>>>;
  opening: { eco: string; name: string; ply: number } | null;
}

export const ANALYSIS_VERSION = 1;

/** Win% for a side. */
export const wpFor = (s: Score, c: Color) => (c === "w" ? winPercent(s) : 100 - winPercent(s));
const cpFor = (s: Score, c: Color) => Math.max(-1000, Math.min(1000, (c === "w" ? 1 : -1) * scoreToCp(s)));

/** lichess move accuracy from the win% drop. */
export const moveAccuracy = (wpLoss: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, wpLoss)) - 3.1669));

export function phaseOf(fen: string, ply: number): Phase {
  let material = 0;
  for (const ch of fen.split(" ")[0]) {
    const t = ch.toLowerCase();
    if ("nbrq".includes(t)) material += pieceValue(t);
  }
  if (material <= 26) return "endgame";
  if (ply <= 20) return "opening";
  return "middlegame";
}

/** The moved piece is left where the opponent can win it: a sacrifice. */
function isSacrifice(fenBefore: string, uci: string, fenAfter: string): boolean {
  const before = new Chess(fenBefore);
  const moved = before.get(uci.slice(0, 2) as Square);
  const captured = before.get(uci.slice(2, 4) as Square);
  if (!moved || moved.type === "p" || moved.type === "k") return false;
  const value = pieceValue(uci.length > 4 ? uci[4] : moved.type);
  if (value < 3) return false;
  if (captured && pieceValue(captured.type) >= value) return false;
  const after = new Chess(fenAfter);
  const to = uci.slice(2, 4) as Square;
  const them: Color = moved.color === "w" ? "b" : "w";
  const attackers = after.attackers(to, them);
  if (!attackers.length) return false;
  const defended = after.attackers(to, moved.color).length > 0;
  const cheapest = Math.min(...attackers.map((sq) => pieceValue(after.get(sq)?.type ?? "k") || 100));
  return !defended || cheapest < value;
}

export function classify(opts: {
  wpLoss: number;
  wpBefore: number;
  wpAfter: number;
  isBest: boolean;
  onlyMoveGap: number;
  book: boolean;
  forced: boolean;
  sacrifice: boolean;
}): MoveClass {
  const { wpLoss, wpBefore, wpAfter, isBest, onlyMoveGap, book, forced, sacrifice } = opts;
  if (forced) return "forced";
  if (book) return "book";
  if (wpLoss < 2 && sacrifice && wpAfter >= 50 && wpBefore < 97) return "brilliant";
  // Only move that keeps the balance in a position that is still undecided.
  if (isBest && onlyMoveGap >= 20 && wpBefore <= 90 && wpAfter >= 30) return "great";
  if (isBest || wpLoss < 0.5) return "best";
  if (wpLoss < 2) return "excellent";
  if (wpLoss < 5) return "good";
  // A missed win: the position was winning, the move keeps it playable but throws the advantage.
  if (wpLoss >= 10 && wpBefore >= 70 && wpAfter >= 40) return "miss";
  if (wpLoss < 10) return "inaccuracy";
  if (wpLoss < 20) return "mistake";
  return "blunder";
}

function harmonicMean(xs: number[]) {
  const safe = xs.map((x) => Math.max(1, x));
  return safe.length / safe.reduce((a, x) => a + 1 / x, 0);
}

export function gameAccuracy(accs: number[]): number {
  if (!accs.length) return 100;
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
  return (mean + harmonicMean(accs)) / 2;
}

/**
 * Turns per-position evaluations into per-move judgements and game summaries. Pure: the
 * engine work happens before (`evals[i]` = eval of the position before move i, plus one
 * more for the final position).
 */
export function buildAnalysis(input: {
  id: string;
  depth: number;
  startFen: string;
  moves: { uci: string; san: string; fen: string }[];
  evals: PositionEval[];
  bookPlies: number;
  opening: GameAnalysis["opening"];
  legalCounts: number[];
}): GameAnalysis {
  const { moves, evals } = input;
  const out: MoveAnalysis[] = [];
  const counts: GameAnalysis["counts"] = { w: {}, b: {} };
  const accs: Record<Color, number[]> = { w: [], b: [] };
  const cpl: Record<Color, number[]> = { w: [], b: [] };
  const phaseAccs: Record<Color, Partial<Record<Phase, number[]>>> = { w: {}, b: {} };

  moves.forEach((m, i) => {
    const fenBefore = i === 0 ? input.startFen : moves[i - 1].fen;
    const color: Color = fenBefore.split(" ")[1] === "b" ? "b" : "w";
    const pre = evals[i];
    const post = evals[i + 1];
    const wpBefore = wpFor(pre.score, color);
    const wpAfter = wpFor(post.score, color);
    const isBest = pre.best === m.uci;
    const wpLoss = isBest ? 0 : Math.max(0, wpBefore - wpAfter);
    const cpLoss = isBest ? 0 : Math.max(0, cpFor(pre.score, color) - cpFor(post.score, color));
    const onlyMoveGap = pre.second ? wpBefore - wpFor(pre.second, color) : 0;
    const cls = classify({
      wpLoss,
      wpBefore,
      wpAfter,
      isBest,
      onlyMoveGap,
      book: i < input.bookPlies,
      forced: input.legalCounts[i] === 1,
      sacrifice: wpLoss < 2 ? isSacrifice(fenBefore, m.uci, m.fen) : false,
    });
    const accuracy = moveAccuracy(wpLoss);
    const phase = phaseOf(fenBefore, i + 1);
    out.push({ ply: i + 1, fenBefore, uci: m.uci, san: m.san, color, before: pre.score, after: post.score, best: pre.best, bestPv: pre.pv, wpLoss, cpLoss, accuracy, cls, phase });
    counts[color][cls] = (counts[color][cls] ?? 0) + 1;
    if (cls !== "forced" && cls !== "book") {
      accs[color].push(accuracy);
      cpl[color].push(cpLoss);
      (phaseAccs[color][phase] ??= []).push(accuracy);
    }
  });

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const phaseAccuracy: GameAnalysis["phaseAccuracy"] = { w: {}, b: {} };
  for (const c of ["w", "b"] as Color[]) for (const [ph, xs] of Object.entries(phaseAccs[c])) phaseAccuracy[c][ph as Phase] = gameAccuracy(xs!);

  return {
    id: input.id,
    version: ANALYSIS_VERSION,
    depth: input.depth,
    startFen: input.startFen,
    positions: evals,
    moves: out,
    accuracy: { w: gameAccuracy(accs.w), b: gameAccuracy(accs.b) },
    acpl: { w: avg(cpl.w), b: avg(cpl.b) },
    counts,
    phaseAccuracy,
    opening: input.opening,
  };
}
