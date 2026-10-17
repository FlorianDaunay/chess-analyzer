import { Chess, DEFAULT_POSITION } from "chess.js";

export interface ParsedPgn {
  headers: Record<string, string>;
  startFen: string;
  ucis: string[];
  sans: string[];
  /** Clock after each move in seconds, from `[%clk h:mm:ss.s]` comments (chess.com, lichess). */
  clocks: (number | undefined)[];
}

function parseClock(text: string): number | undefined {
  const m = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(text);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Parses a single-game PGN (headers, main line, clock comments). Variations are ignored. */
export function parsePgn(pgn: string): ParsedPgn {
  const headers: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) headers[m[1]] = m[2];
  const body = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, "");

  // Tokenize: comments, variations (skipped), move numbers, NAGs, results, moves.
  const tokens: { type: "move" | "comment"; text: string }[] = [];
  let depth = 0;
  const re = /\{([^}]*)\}|;[^\n]*|(\()|(\))|(\d+\.(?:\.\.)?)|(\$\d+)|(1-0|0-1|1\/2-1\/2|\*)|([^\s(){};]+)/g;
  for (const m of body.matchAll(re)) {
    if (m[2]) depth++;
    else if (m[3]) depth--;
    else if (depth > 0) continue;
    else if (m[1] !== undefined) tokens.push({ type: "comment", text: m[1] });
    else if (m[7]) tokens.push({ type: "move", text: m[7].replace(/^\d+\.+/, "") });
  }

  const startFen = headers.FEN || DEFAULT_POSITION;
  const chess = new Chess(startFen);
  const ucis: string[] = [];
  const sans: string[] = [];
  const clocks: (number | undefined)[] = [];
  for (const t of tokens) {
    if (t.type === "comment") {
      if (ucis.length) clocks[ucis.length - 1] = parseClock(t.text) ?? clocks[ucis.length - 1];
      continue;
    }
    const san = t.text.replace(/[!?]+$/, "");
    if (!san) continue;
    let move;
    try {
      move = chess.move(san, { strict: false });
    } catch {
      break; // stop at the first unreadable move, keep what we have
    }
    ucis.push(move.lan);
    sans.push(move.san);
    clocks.push(undefined);
  }
  return { headers, startFen, ucis, sans, clocks };
}

/** "1. e4 e5 2. Nf3" from SAN moves (for exports and the opening trainer). */
export function sanLine(sans: string[], startPly = 0): string {
  return sans
    .map((san, i) => {
      const ply = startPly + i;
      if (ply % 2 === 0) return `${ply / 2 + 1}. ${san}`;
      return i === 0 ? `${Math.floor(ply / 2) + 1}... ${san}` : san;
    })
    .join(" ");
}
