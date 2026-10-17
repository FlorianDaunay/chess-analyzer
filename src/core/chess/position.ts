import { Chess } from "chess.js";
import type { Color } from "./rules";

/** Square → piece ("wK", "bP"...). */
export type Placement = Record<string, string>;

const FILES = "abcdefgh";

export function placementFromFen(fen: string): Placement {
  const out: Placement = {};
  fen
    .split(" ")[0]
    .split("/")
    .forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else {
          out[FILES[f] + (8 - r)] = (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase();
          f++;
        }
      }
    });
  return out;
}

export function placementToFen(p: Placement): string {
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = "";
    let empty = 0;
    for (const f of FILES) {
      const piece = p[f + r];
      if (!piece) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += piece[0] === "w" ? piece[1] : piece[1].toLowerCase();
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join("/");
}

export interface PositionMeta {
  turn: Color;
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
  ep: string | null;
}

/** Castling rights only make sense with king and rook on their original squares. */
export function possibleCastling(p: Placement) {
  return {
    K: p.e1 === "wK" && p.h1 === "wR",
    Q: p.e1 === "wK" && p.a1 === "wR",
    k: p.e8 === "bK" && p.h8 === "bR",
    q: p.e8 === "bK" && p.a8 === "bR",
  };
}

export function buildFen(p: Placement, meta: PositionMeta): string {
  const can = possibleCastling(p);
  const c = (["K", "Q", "k", "q"] as const).filter((k) => meta.castling[k] && can[k]).join("") || "-";
  return `${placementToFen(p)} ${meta.turn} ${c} ${meta.ep ?? "-"} 0 1`;
}

/** Human-readable problems that make a position unplayable. */
export function positionProblems(fen: string): string[] {
  const p = placementFromFen(fen);
  const problems: string[] = [];
  const count = (code: string) => Object.values(p).filter((x) => x === code).length;
  if (count("wK") !== 1) problems.push("White needs exactly one king.");
  if (count("bK") !== 1) problems.push("Black needs exactly one king.");
  if (Object.entries(p).some(([sq, x]) => x[1] === "P" && (sq[1] === "1" || sq[1] === "8"))) problems.push("Pawns cannot stand on the first or last rank.");
  if (count("wP") > 8 || count("bP") > 8) problems.push("At most 8 pawns per side.");
  if (problems.length) return problems;
  try {
    new Chess(fen);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "Invalid position.");
    return problems;
  }
  // The side that just moved cannot be in check.
  const turn = fen.split(" ")[1];
  const flipped = fen.replace(/ [wb] /, ` ${turn === "w" ? "b" : "w"} `).replace(/ [a-h][36] /, " - ");
  try {
    if (new Chess(flipped).inCheck()) problems.push(`${turn === "w" ? "Black" : "White"} is in check but it is not their move.`);
  } catch {
    /* ignore */
  }
  return problems;
}

export const START_PLACEMENT = placementFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
