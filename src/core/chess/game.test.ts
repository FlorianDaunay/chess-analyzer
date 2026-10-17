import { describe, expect, it } from "vitest";
import { createGame, makeMove, takeback, resign, checkTimeout, remainingMs, offerDraw, toPgn, type GameState } from "./game";
import { shuffleFen, describeClock } from "./rules";
import { parsePgn } from "./pgn";
import { treeFromMoves, addMove, mainLine, deleteNode, promoteNode, isOnMainLine } from "./tree";

function play(state: GameState, moves: string[], now = 0): GameState {
  for (const m of moves) {
    const r = makeMove(state, m, now);
    if (!r.ok) throw new Error(`${m}: ${r.error}`);
    state = r.state;
  }
  return state;
}

describe("game engine", () => {
  it("plays and detects checkmate (fool's mate)", () => {
    const g = play(createGame({}), ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(g.result).toEqual({ winner: "b", reason: "checkmate" });
    expect(g.moves.map((m) => m.san)).toEqual(["f3", "e5", "g4", "Qh4#"]);
  });

  it("refuses illegal moves and moves after the end", () => {
    const g = createGame({});
    expect(makeMove(g, "e2e5", 0)).toEqual({ ok: false, error: "illegal" });
    const over = play(g, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(makeMove(over, "a2a3", 0)).toEqual({ ok: false, error: "gameOver" });
  });

  it("never mutates its input", () => {
    const g = createGame({});
    const copy = structuredClone(g);
    makeMove(g, "e2e4", 0);
    expect(g).toEqual(copy);
  });

  it("king of the hill wins on a center square", () => {
    const g = play(createGame({ variant: "kingOfTheHill", start: "fen", fen: "8/8/8/8/8/2K5/8/7k w - - 0 1" }), ["c3d4"]);
    expect(g.result).toEqual({ winner: "w", reason: "kingOfTheHill" });
  });

  it("three-check counts checks", () => {
    const g = play(createGame({ variant: "threeCheck" }), ["e2e4", "e7e5", "f1b5", "c7c6", "b5c6", "d7c6", "d1h5", "a7a6", "h5f7"]);
    expect(g.checks.w).toBe(1);
    expect(g.result).toBeNull();
    const g2 = play(g, ["e8f7", "d2d3", "f8b4"]);
    expect(g2.checks.b).toBe(1);
  });

  it("clocks start after both first moves, add increment and flag", () => {
    let g = createGame({ clock: { whiteMs: 10_000, blackMs: 5000, incrementMs: 1000 } });
    g = play(g, ["e2e4"], 0);
    g = play(g, ["e7e5"], 1000);
    expect(g.turnStartedAt).toBe(1000);
    g = play(g, ["g1f3"], 4000); // white thought 3 s, gets +1 s
    expect(g.clocks!.w).toBe(10_000 - 3000 + 1000);
    expect(remainingMs(g, "b", 6000)).toBe(5000 - 2000);
    expect(checkTimeout(g, 4000 + 5001)?.result).toEqual({ winner: "w", reason: "timeout" });
  });

  it("takes back moves", () => {
    const g = play(createGame({}), ["e2e4", "e7e5", "g1f3"]);
    const r = takeback(g, 2, 0);
    expect(r.ok && r.state.moves.map((m) => m.san)).toEqual(["e4"]);
  });

  it("resigns and agrees draws", () => {
    const g = createGame({});
    const r = resign(g, "w", 0);
    expect(r.ok && r.state.result).toEqual({ winner: "b", reason: "resign" });
    const o = offerDraw(g, "w", 0);
    const a = o.ok ? offerDraw(o.state, "b", 0) : o;
    expect(a.ok && a.state.result).toEqual({ winner: null, reason: "agreement" });
  });

  it("shuffle positions are valid and deterministic", () => {
    for (let seed = 1; seed < 200; seed++) {
      const fen = shuffleFen(seed);
      expect(fen).toBe(shuffleFen(seed));
      const rank = fen.split("/")[0];
      const bishops = [...rank].map((c, i) => (c === "b" ? i % 2 : -1)).filter((x) => x >= 0);
      expect(bishops.sort()).toEqual([0, 1]);
      const k = rank.indexOf("k");
      expect(rank.indexOf("r")).toBeLessThan(k);
      expect(rank.lastIndexOf("r")).toBeGreaterThan(k);
      expect(() => createGame({ start: "shuffle", shuffleSeed: seed })).not.toThrow();
    }
  });

  it("exports PGN", () => {
    const g = play(createGame({}), ["e2e4", "e7e5"]);
    expect(toPgn(g)).toContain("1. e4 e5");
    expect(describeClock({ whiteMs: 180000, blackMs: 180000, incrementMs: 2000 })).toBe("3+2");
  });
});

describe("pgn", () => {
  it("parses chess.com style PGN with clocks", () => {
    const pgn = `[Event "Live Chess"]\n[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. d4 {[%clk 0:03:00]} 1... Nf6 {[%clk 0:02:59.3]} 2. Nf3 (2. c4 e6) 2... g6 $1 3. g3 1-0`;
    const p = parsePgn(pgn);
    expect(p.headers.White).toBe("a");
    expect(p.sans).toEqual(["d4", "Nf6", "Nf3", "g6", "g3"]);
    expect(p.ucis[0]).toBe("d2d4");
    expect(p.clocks[0]).toBe(180);
    expect(p.clocks[1]).toBeCloseTo(179.3);
    expect(p.clocks[2]).toBeUndefined();
  });
});

describe("move tree", () => {
  it("adds variations without touching the main line", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    let t = treeFromMoves(start, ["e2e4", "e7e5", "g1f3"]);
    const line = mainLine(t);
    expect(line.map((n) => n.san)).toEqual(["e4", "e5", "Nf3"]);
    const v = addMove(t, line[1].id, "f2f4")!;
    t = v.tree;
    expect(mainLine(t).map((n) => n.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(isOnMainLine(t, v.nodeId)).toBe(false);
    expect(addMove(t, line[1].id, "f2f4")!.nodeId).toBe(v.nodeId);
    const promoted = promoteNode(t, v.nodeId);
    expect(mainLine(promoted).map((n) => n.san)).toEqual(["e4", "e5", "f4"]);
    const del = deleteNode(t, v.nodeId);
    expect(del.nodes[v.nodeId]).toBeUndefined();
  });
});
