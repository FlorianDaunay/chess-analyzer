import { Chess } from "chess.js";
import type { GameAnalysis } from "../analysis/classify";
import { wpFor } from "../analysis/classify";
import type { GameSummary } from "../chesscom/api";
import type { Score } from "../engine/uci";
import { rng } from "../chess/rules";

export type PuzzleKind = "fix" | "punish" | "mate" | "compare" | "evaluate";

export interface Puzzle {
  id: string;
  kind: PuzzleKind;
  fen: string;
  /** Side to move = the player's side. */
  color: "w" | "b";
  /** Moves to find (player's moves at even indexes, replies at odd). */
  solution: string[];
  /** Eval of the position with best play. */
  score: Score;
  /** The move played in the game (the mistake), if any. */
  played?: string;
  playedScore?: Score;
  gameId: string;
  ply: number;
  opponent: string;
  date: number;
}

const mateIn = (s: Score, color: "w" | "b") => (s.mate !== undefined && (color === "w" ? s.mate > 0 : s.mate < 0) ? Math.abs(s.mate) : null);

/** Builds exercises from the player's analyzed games: their mistakes become their lessons. */
export function generatePuzzles(games: GameSummary[], analyses: Map<string, GameAnalysis>): Puzzle[] {
  const out: Puzzle[] = [];
  for (const g of games) {
    const a = analyses.get(g.id);
    if (!a) continue;
    a.moves.forEach((m, i) => {
      const base = { gameId: g.id, opponent: g.opponent, date: g.endTime * 1000, color: m.color };
      if (m.color === g.color) {
        const mate = mateIn(m.before, m.color);
        // Mates: the full forced line, when the player missed it.
        if (mate && mate <= 4 && m.best !== m.uci && m.bestPv.length >= mate * 2 - 1) {
          out.push({ ...base, id: `${g.id}#${m.ply}m`, kind: "mate", fen: m.fenBefore, solution: m.bestPv.slice(0, mate * 2 - 1), score: m.before, played: m.uci, playedScore: m.after, ply: m.ply });
          return;
        }
        if ((m.cls === "mistake" || m.cls === "blunder" || m.cls === "miss") && m.best) {
          out.push({ ...base, id: `${g.id}#${m.ply}f`, kind: "fix", fen: m.fenBefore, solution: [m.best], score: m.before, played: m.uci, playedScore: m.after, ply: m.ply });
          if (m.cls !== "miss" && wpFor(m.before, m.color) - wpFor(m.after, m.color) >= 15)
            out.push({ ...base, id: `${g.id}#${m.ply}c`, kind: "compare", fen: m.fenBefore, solution: [m.best], score: m.before, played: m.uci, playedScore: m.after, ply: m.ply });
        }
      } else if ((m.cls === "blunder" || m.cls === "mistake") && i + 1 < a.moves.length) {
        // The opponent erred: can the player punish it?
        const next = a.moves[i + 1];
        if (next.best && wpFor(next.before, next.color) >= 65) {
          out.push({ ...base, color: next.color, id: `${g.id}#${next.ply}p`, kind: "punish", fen: next.fenBefore, solution: [next.best], score: next.before, played: next.uci, playedScore: next.after, ply: next.ply });
        }
      }
    });
    // A few positions to evaluate from each game (quiet middlegame positions).
    const candidates = a.moves.filter((m) => m.ply >= 16 && m.ply % 7 === 0 && m.phase !== "opening" && m.before.mate === undefined);
    for (const m of candidates.slice(0, 2))
      out.push({ id: `${g.id}#${m.ply}e`, kind: "evaluate", fen: m.fenBefore, color: g.color, solution: m.best ? [m.best] : [], score: m.before, gameId: g.id, ply: m.ply, opponent: g.opponent, date: g.endTime * 1000 });
  }
  return out;
}

export type EvalAnswer = "w" | "=" | "b";
/** The answer for an "evaluate" exercise: ±1.2 pawns is a clear advantage. */
export function evalAnswer(s: Score): EvalAnswer {
  if (s.mate !== undefined) return s.mate > 0 ? "w" : "b";
  const cp = s.cp ?? 0;
  return cp >= 120 ? "w" : cp <= -120 ? "b" : "=";
}

/** Pieces that can be captured for free (undefended, or attacked by a cheaper piece). */
export function hangingPieces(fen: string): string[] {
  const chess = new Chess(fen);
  const value: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const out: string[] = [];
  for (const row of chess.board())
    for (const p of row) {
      if (!p || p.type === "k") continue;
      const them = p.color === "w" ? "b" : "w";
      const attackers = chess.attackers(p.square, them);
      if (!attackers.length) continue;
      const defended = chess.attackers(p.square, p.color).length > 0;
      const cheapest = Math.min(...attackers.map((sq) => value[chess.get(sq)!.type]));
      if (!defended || cheapest < value[p.type]) out.push(p.square);
    }
  return out;
}

/** Positions from the player's games for board-vision drills (middlegame, with some tension). */
export function visionPositions(pgnsFens: string[], seed: number, count = 20): string[] {
  const rand = rng(seed);
  const pool = pgnsFens.filter((f) => {
    try {
      return !new Chess(f).inCheck();
    } catch {
      return false;
    }
  });
  const picked: string[] = [];
  while (pool.length && picked.length < count) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return picked;
}

export interface EndgameDrill {
  id: string;
  name: string;
  goal: "win" | "draw";
  fen: string;
  description: string;
  /** Moves allowed to reach the goal (win) or to survive (draw). */
  moves: number;
}

export const ENDGAMES: EndgameDrill[] = [
  { id: "kq", name: "Queen mate", goal: "win", fen: "8/8/8/4k3/8/8/8/3QK3 w - - 0 1", description: "Checkmate the lone king with king and queen.", moves: 25 },
  { id: "kr", name: "Rook mate", goal: "win", fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1", description: "Box the king in with the rook, bring your king, mate.", moves: 35 },
  { id: "kbb", name: "Two bishops", goal: "win", fen: "8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1", description: "Drive the king to a corner with both bishops.", moves: 45 },
  { id: "kp", name: "King and pawn", goal: "win", fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", description: "King on the 6th rank in front of the pawn: promote it.", moves: 40 },
  { id: "kp-def", name: "Hold the draw", goal: "draw", fen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1", description: "Defend with Black: keep the opposition and don't let the pawn through.", moves: 30 },
  { id: "lucena", name: "Lucena", goal: "win", fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", description: "Build the bridge and promote.", moves: 30 },
  { id: "philidor", name: "Philidor", goal: "draw", fen: "4k3/8/r7/3PK3/8/8/8/7R b - - 0 1", description: "Defend the rook endgame with Black.", moves: 30 },
  { id: "qvr", name: "Queen vs rook", goal: "win", fen: "8/8/8/3k4/8/8/2r5/4K2Q w - - 0 1", description: "A hard one: win the rook or mate.", moves: 50 },
];
