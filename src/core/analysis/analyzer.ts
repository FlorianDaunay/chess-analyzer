import { Chess } from "chess.js";
import { Engine } from "../engine/engine";
import type { Score } from "../engine/uci";
import { parsePgn } from "../chess/pgn";
import { epdOf, identifyOpening, loadOpenings } from "../chess/openings";
import { buildAnalysis, type GameAnalysis, type PositionEval } from "./classify";

/** Terminal positions are scored without the engine. */
function terminalEval(fen: string): PositionEval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { score: { cp: chess.turn() === "w" ? -10_000 : 10_000 }, best: null, pv: [] };
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { score: { cp: 0 }, best: null, pv: [] };
  return null;
}

/**
 * Several Stockfish workers evaluating positions in parallel. Evaluations are cached by
 * position and depth, so opening positions shared by many games are computed once.
 */
export class AnalysisPool {
  private engines: Engine[];
  private cache = new Map<string, PositionEval>();
  private next = 0;

  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))) {
    this.engines = Array.from({ length: size }, () => new Engine());
  }

  get size() {
    return this.engines.length;
  }

  async evaluate(fen: string, depth: number): Promise<PositionEval> {
    const key = `${epdOf(fen)}|${depth}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const terminal = terminalEval(fen);
    if (terminal) return terminal;
    const slot = this.next++ % this.engines.length;
    // A crashed worker is replaced (it fails for good only if the new one fails too).
    if (this.engines[slot].isDead()) this.engines[slot] = new Engine();
    const engine = this.engines[slot];
    const a = await engine.analyse(fen, { depth, multipv: 2 }).promise;
    const first = a.lines[0];
    const ev: PositionEval = {
      score: first?.score ?? ({ cp: 0 } as Score),
      best: a.bestmove,
      pv: first?.pv.slice(0, 12) ?? [],
      second: a.lines[1]?.score,
    };
    if (this.cache.size > 50_000) this.cache.clear();
    this.cache.set(key, ev);
    return ev;
  }

  stop() {
    this.engines.forEach((e) => e.stop());
  }

  terminate() {
    this.engines.forEach((e) => e.terminate());
  }
}

/** Full analysis of one game from its PGN. */
export async function analyzePgn(pool: AnalysisPool, id: string, pgn: string, depth: number, onProgress?: (done: number, total: number) => void): Promise<GameAnalysis> {
  const parsed = parsePgn(pgn);
  const chess = new Chess(parsed.startFen);
  const fens = [parsed.startFen];
  const legalCounts: number[] = [];
  const moves = parsed.ucis.map((uci, i) => {
    legalCounts.push(chess.moves().length);
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    fens.push(chess.fen());
    return { uci, san: parsed.sans[i], fen: chess.fen() };
  });

  const book = await loadOpenings();
  const found = identifyOpening(book, fens.slice(1));
  // Book moves: as long as every position so far is a named opening position.
  let bookPlies = 0;
  while (bookPlies < moves.length && book.byEpd.has(epdOf(fens[bookPlies + 1]))) bookPlies++;

  let done = 0;
  const evals = await Promise.all(
    fens.map((fen) =>
      pool.evaluate(fen, depth).then((ev) => {
        onProgress?.(++done, fens.length);
        return ev;
      })
    )
  );

  return buildAnalysis({
    id,
    depth,
    startFen: parsed.startFen,
    moves,
    evals,
    bookPlies,
    opening: found ? { eco: found.opening.eco, name: found.opening.name, ply: found.ply } : null,
    legalCounts,
  });
}
