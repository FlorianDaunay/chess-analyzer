import { describe, expect, it } from "vitest";
import { applyRoomAction, createRoom, joinRoom, roomTick, setConnected, type RoomSnapshot } from "./room";
import { roundRobinSchedule, standings } from "./tournament";

function join(r: RoomSnapshot, id: string): RoomSnapshot {
  const res = joinRoom(r, { id, name: id.toUpperCase() }, 0);
  if ("error" in res) throw new Error(res.error);
  return res.room;
}
function act(r: RoomSnapshot, who: string, a: Parameters<typeof applyRoomAction>[2], now = 0): RoomSnapshot {
  const res = applyRoomAction(r, who, a, now);
  if (!res.ok) throw new Error(`${a.t}: ${res.error}`);
  return res.room;
}
const FOOLS = ["f2f3", "e7e5", "g2g4", "d8h4"];

describe("match room", () => {
  it("plays a game, enforces turns and rematches with swapped colours", () => {
    let r = createRoom("ABCD", { id: "h", name: "Host" }, { firstWhite: "host" }, null);
    r = join(r, "g");
    r = join(r, "s");
    expect(r.lobby.find((p) => p.id === "s")!.spectator).toBe(true);
    expect(applyRoomAction(r, "g", { t: "start" }, 0)).toEqual({ ok: false, error: "notHost" });
    r = act(r, "h", { t: "start" });
    const id = r.matchGames[0];
    expect(r.games[id].white).toBe("h");
    expect(applyRoomAction(r, "g", { t: "move", gameId: id, uci: "e2e4" }, 0).ok).toBe(false);
    expect(applyRoomAction(r, "s", { t: "move", gameId: id, uci: "e2e4" }, 0).ok).toBe(false);
    FOOLS.forEach((m, i) => (r = act(r, i % 2 ? "g" : "h", { t: "move", gameId: id, uci: m })));
    expect(r.games[id].state.result?.winner).toBe("b");
    r = act(r, "h", { t: "rematch" });
    expect(r.matchGames.length).toBe(1);
    r = act(r, "g", { t: "rematch" });
    expect(r.matchGames.length).toBe(2);
    expect(r.games[r.matchGames[1]].white).toBe("g");
  });

  it("takebacks need the opponent's agreement", () => {
    let r = createRoom("ABCD", { id: "h", name: "Host" }, { firstWhite: "host", rules: { variant: "standard", start: "standard", clock: null, takebacks: true, hints: false } }, null);
    r = join(r, "g");
    r = act(r, "h", { t: "start" });
    const id = r.matchGames[0];
    r = act(r, "h", { t: "move", gameId: id, uci: "e2e4" });
    r = act(r, "h", { t: "takeback", gameId: id });
    expect(r.games[id].state.moves.length).toBe(1);
    r = act(r, "g", { t: "takeback", gameId: id });
    expect(r.games[id].state.moves.length).toBe(0);
  });

  it("a disconnected player loses after the abandon delay", () => {
    let r = createRoom("ABCD", { id: "h", name: "Host" }, { firstWhite: "host", abandonAfter: 10 }, null);
    r = join(r, "g");
    r = act(r, "h", { t: "start" });
    r = setConnected(r, "g", false, 1000);
    expect(roomTick(r, 5000)).toBeNull();
    const after = roomTick(r, 12_000)!;
    expect(after.games[r.matchGames[0]].state.result).toEqual({ winner: "w", reason: "abandon" });
  });
});

describe("tournaments", () => {
  it("round robin: everyone meets everyone once", () => {
    const rounds = roundRobinSchedule(["a", "b", "c", "d", "e"], false);
    expect(rounds.length).toBe(5);
    const meetings = new Set<string>();
    for (const round of rounds) for (const [w, b] of round) if (b) meetings.add([w, b].sort().join());
    expect(meetings.size).toBe(10);
  });

  it("runs a full swiss and a knockout", () => {
    for (const format of ["swiss", "knockout", "roundRobin"] as const) {
      let r = createRoom("T", { id: "p0", name: "P0" }, { kind: "tournament", format, swissRounds: 3, rules: { variant: "standard", start: "standard", clock: null, takebacks: false, hints: false } }, null);
      for (let i = 1; i < 5; i++) r = join(r, `p${i}`);
      r = act(r, "p0", { t: "start" });
      let guard = 0;
      while (r.phase === "playing" && guard++ < 20) {
        for (const g of Object.values(r.games)) if (!g.state.result) r = act(r, g.white, { t: "resign", gameId: g.id });
        r = act(r, "p0", { t: "nextRound" });
      }
      expect(r.phase).toBe("finished");
      const table = standings(r.tournament!, r.lobby.map((p) => p.id));
      if (format === "knockout") expect(table.filter((s) => !s.eliminated).length).toBe(1);
      if (format === "swiss") {
        expect(r.tournament!.round).toBe(3);
        const pairs = r.tournament!.pairings.filter((p) => p.black).map((p) => [p.white, p.black].sort().join());
        expect(new Set(pairs).size).toBe(pairs.length);
      }
    }
  });
});
