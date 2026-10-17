import { Chess, type Square } from "chess.js";
import { type Color, type Rules, normalizeRules, startFen } from "./rules";

export interface PlayedMove {
  uci: string;
  san: string;
  /** Position after the move. */
  fen: string;
  /** Clock of the mover after the move (ms), when the game has a clock. */
  clockMs?: number;
}

export type ResultReason =
  | "checkmate"
  | "stalemate"
  | "repetition"
  | "insufficient"
  | "fiftyMoves"
  | "timeout"
  | "resign"
  | "agreement"
  | "kingOfTheHill"
  | "threeCheck"
  | "abandon";

export interface GameResult {
  winner: Color | null;
  reason: ResultReason;
}

export interface GameState {
  rules: Rules;
  startFen: string;
  moves: PlayedMove[];
  result: GameResult | null;
  /** Remaining time of each side at `turnStartedAt`. */
  clocks: { w: number; b: number } | null;
  /** When the side to move started thinking (null before the first move: clocks start after White's first move). */
  turnStartedAt: number | null;
  checks: { w: number; b: number };
  drawOffer: Color | null;
  takebackOffer: Color | null;
}

export type GameError = "gameOver" | "illegal" | "notYourTurn" | "noMoves" | "notAllowed";
export type GameUpdate = { ok: true; state: GameState } | { ok: false; error: GameError };

const HILL = new Set(["d4", "e4", "d5", "e5"]);

export const RESULT_TEXT: Record<ResultReason, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  repetition: "Threefold repetition",
  insufficient: "Insufficient material",
  fiftyMoves: "50-move rule",
  timeout: "Time out",
  resign: "Resignation",
  agreement: "Draw agreed",
  kingOfTheHill: "King reached the hill",
  threeCheck: "Third check",
  abandon: "Opponent left",
};

export function describeResult(result: GameResult): string {
  const who = result.winner === "w" ? "White wins" : result.winner === "b" ? "Black wins" : "Draw";
  return `${who} — ${RESULT_TEXT[result.reason]}`;
}

export function resultScore(result: GameResult | null): "1-0" | "0-1" | "1/2-1/2" | "*" {
  if (!result) return "*";
  return result.winner === "w" ? "1-0" : result.winner === "b" ? "0-1" : "1/2-1/2";
}

export function createGame(rulesInput: Partial<Rules>): GameState {
  const rules = normalizeRules(rulesInput);
  const fen = startFen(rules);
  new Chess(fen); // throws on an invalid start position
  return {
    rules,
    startFen: fen,
    moves: [],
    result: null,
    clocks: rules.clock ? { w: rules.clock.whiteMs, b: rules.clock.blackMs } : null,
    turnStartedAt: null,
    checks: { w: 0, b: 0 },
    drawOffer: null,
    takebackOffer: null,
  };
}

/** A chess.js instance with the whole game replayed (needed for repetition detection). */
export function replay(state: Pick<GameState, "startFen" | "moves">, upTo = state.moves.length): Chess {
  const chess = new Chess(state.startFen);
  for (const m of state.moves.slice(0, upTo)) chess.move(uciToMove(m.uci));
  return chess;
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

export const currentFen = (state: GameState) => (state.moves.length ? state.moves[state.moves.length - 1].fen : state.startFen);
export const turnOf = (fen: string): Color => (fen.split(" ")[1] === "b" ? "b" : "w");
export const sideToMove = (state: GameState): Color => turnOf(currentFen(state));
export const other = (c: Color): Color => (c === "w" ? "b" : "w");

/** Legal destinations per origin square, for the board. */
export function legalDests(fen: string): Map<string, string[]> {
  const dests = new Map<string, string[]>();
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return dests;
  }
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from) ?? [];
    if (!list.includes(m.to)) list.push(m.to);
    dests.set(m.from, list);
  }
  return dests;
}

export function isPromotion(fen: string, from: string, to: string): boolean {
  try {
    const chess = new Chess(fen);
    return chess.moves({ square: from as Square, verbose: true }).some((m) => m.to === to && !!m.promotion);
  } catch {
    return false;
  }
}

/** Time left for a side at `now`. */
export function remainingMs(state: GameState, color: Color, now: number): number | null {
  if (!state.clocks) return null;
  const base = state.clocks[color];
  if (state.result || state.turnStartedAt === null || sideToMove(state) !== color) return base;
  return Math.max(0, base - (now - state.turnStartedAt));
}

function finish(state: GameState, result: GameResult, now: number): GameState {
  if (state.clocks && state.turnStartedAt !== null) {
    const mover = sideToMove(state);
    state.clocks[mover] = remainingMs({ ...state, result: null }, mover, now) ?? state.clocks[mover];
  }
  state.result = result;
  state.drawOffer = null;
  state.takebackOffer = null;
  return state;
}

function insufficientFor(chess: Chess, color: Color): boolean {
  // The side has only a king, or king + one minor piece: it cannot mate.
  const pieces = chess.board().flat().filter((p) => p && p.color === color && p.type !== "k");
  return pieces.length === 0 || (pieces.length === 1 && (pieces[0]!.type === "n" || pieces[0]!.type === "b"));
}

export function makeMove(input: GameState, uci: string, now: number): GameUpdate {
  if (input.result) return { ok: false, error: "gameOver" };
  const timedOut = checkTimeout(input, now);
  if (timedOut) return { ok: true, state: timedOut };
  const chess = replay(input);
  let move;
  try {
    move = chess.move(uciToMove(uci));
  } catch {
    return { ok: false, error: "illegal" };
  }
  const state = structuredClone(input);
  const mover = move.color;
  const played: PlayedMove = { uci: move.lan, san: move.san, fen: chess.fen() };

  if (state.clocks) {
    if (state.turnStartedAt !== null) {
      state.clocks[mover] = Math.max(0, state.clocks[mover] - (now - state.turnStartedAt)) + (state.rules.clock?.incrementMs ?? 0);
    }
    played.clockMs = state.clocks[mover];
  }
  // Clocks start once both sides have moved once (like online play), so nobody flags before starting.
  state.turnStartedAt = state.moves.length >= 1 ? now : null;
  state.moves.push(played);
  state.drawOffer = state.drawOffer === mover ? mover : null;
  state.takebackOffer = null;

  if (chess.inCheck()) state.checks[mover] += 1;

  if (chess.isCheckmate()) return { ok: true, state: finish(state, { winner: mover, reason: "checkmate" }, now) };
  if (state.rules.variant === "kingOfTheHill" && HILL.has(move.to) && move.piece === "k")
    return { ok: true, state: finish(state, { winner: mover, reason: "kingOfTheHill" }, now) };
  if (state.rules.variant === "threeCheck" && state.checks[mover] >= 3)
    return { ok: true, state: finish(state, { winner: mover, reason: "threeCheck" }, now) };
  if (chess.isStalemate()) return { ok: true, state: finish(state, { winner: null, reason: "stalemate" }, now) };
  if (chess.isThreefoldRepetition()) return { ok: true, state: finish(state, { winner: null, reason: "repetition" }, now) };
  // King of the Hill: a lone king can still walk to the center, so insufficient material is not a draw there.
  if (state.rules.variant !== "kingOfTheHill" && chess.isInsufficientMaterial())
    return { ok: true, state: finish(state, { winner: null, reason: "insufficient" }, now) };
  if (chess.isDrawByFiftyMoves()) return { ok: true, state: finish(state, { winner: null, reason: "fiftyMoves" }, now) };
  return { ok: true, state };
}

/** Returns the finished state if the side to move has run out of time, else null. */
export function checkTimeout(state: GameState, now: number): GameState | null {
  if (state.result || !state.clocks || state.turnStartedAt === null) return null;
  const mover = sideToMove(state);
  if ((remainingMs(state, mover, now) ?? 1) > 0) return null;
  const next = structuredClone(state);
  next.clocks![mover] = 0;
  next.turnStartedAt = null;
  const chess = replay(state);
  const winner = other(mover);
  next.result = insufficientFor(chess, winner) && state.rules.variant !== "kingOfTheHill" ? { winner: null, reason: "timeout" } : { winner, reason: "timeout" };
  next.drawOffer = null;
  return next;
}

export function resign(state: GameState, color: Color, now: number): GameUpdate {
  if (state.result) return { ok: false, error: "gameOver" };
  return { ok: true, state: finish(structuredClone(state), { winner: other(color), reason: "resign" }, now) };
}

export function abandon(state: GameState, leaver: Color, now: number): GameUpdate {
  if (state.result) return { ok: false, error: "gameOver" };
  return { ok: true, state: finish(structuredClone(state), { winner: other(leaver), reason: "abandon" }, now) };
}

export function offerDraw(state: GameState, color: Color, now: number): GameUpdate {
  if (state.result) return { ok: false, error: "gameOver" };
  if (state.drawOffer && state.drawOffer !== color) return { ok: true, state: finish(structuredClone(state), { winner: null, reason: "agreement" }, now) };
  return { ok: true, state: { ...state, drawOffer: color } };
}

export function declineOffers(state: GameState): GameState {
  return { ...state, drawOffer: null, takebackOffer: null };
}

/** Undo the last move (count = 1) or the last full move (count = 2, vs an AI). */
export function takeback(input: GameState, count: 1 | 2, now: number): GameUpdate {
  if (input.result) return { ok: false, error: "gameOver" };
  if (input.moves.length < count) return { ok: false, error: "noMoves" };
  const state = structuredClone(input);
  state.moves = state.moves.slice(0, -count);
  // Recount checks from scratch.
  state.checks = { w: 0, b: 0 };
  const chess = new Chess(state.startFen);
  for (const m of state.moves) {
    const mv = chess.move(uciToMove(m.uci));
    if (chess.inCheck()) state.checks[mv.color] += 1;
  }
  // Clocks go back to what they were after each side's previous move.
  if (state.clocks && state.rules.clock) {
    for (const color of ["w", "b"] as Color[]) {
      const last = [...state.moves].reverse().find((m) => turnOf(m.fen) !== color);
      state.clocks[color] = last?.clockMs ?? (color === "w" ? state.rules.clock.whiteMs : state.rules.clock.blackMs);
    }
    state.turnStartedAt = state.moves.length >= 2 ? now : null;
  }
  state.drawOffer = null;
  state.takebackOffer = null;
  return { ok: true, state };
}

export function toPgn(state: GameState, headers: Record<string, string> = {}): string {
  const chess = replay(state);
  const all: Record<string, string> = {
    Event: "Chess Lab game",
    Site: "Chess Lab",
    Date: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    Result: resultScore(state.result),
    ...headers,
  };
  if (state.startFen !== new Chess().fen()) {
    all.SetUp = "1";
    all.FEN = state.startFen;
  }
  if (state.rules.variant !== "standard") all.Variant = state.rules.variant;
  for (const [k, v] of Object.entries(all)) chess.setHeader(k, v);
  const pgn = chess.pgn();
  return pgn.endsWith(all.Result) ? pgn : `${pgn} ${all.Result}`;
}

/** Normalizes a game coming from storage or the network (fields added later get defaults). */
export function normalizeGame(input: GameState): GameState {
  return {
    ...input,
    rules: normalizeRules(input.rules),
    checks: input.checks ?? { w: 0, b: 0 },
    drawOffer: input.drawOffer ?? null,
    takebackOffer: input.takebackOffer ?? null,
  };
}
