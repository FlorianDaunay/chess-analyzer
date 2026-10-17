import { rng } from "../chess/rules";

export type Format = "roundRobin" | "doubleRoundRobin" | "swiss" | "knockout";

export const FORMATS: { id: Format; name: string; description: string }[] = [
  { id: "roundRobin", name: "Round robin", description: "Everyone plays everyone once." },
  { id: "doubleRoundRobin", name: "Double round robin", description: "Everyone plays everyone twice, once with each colour." },
  { id: "swiss", name: "Swiss", description: "Players with similar scores meet; no rematches. Choose the number of rounds." },
  { id: "knockout", name: "Knockout", description: "Lose and you're out. A draw is replayed with colours swapped; after two draws, Black wins (Armageddon)." },
];

/** One board of a round. `black` null = bye. */
export interface Pairing {
  id: string;
  round: number;
  white: string;
  black: string | null;
  /** Games played for this pairing (several in knockout when drawn). */
  gameIds: string[];
  /** Points of white/black once finished (bye: 1-0). */
  result: { w: number; b: number } | null;
  /** Knockout: who goes through. */
  winner?: string;
}

export interface TournamentState {
  format: Format;
  totalRounds: number;
  round: number;
  pairings: Pairing[];
  seed: number;
}

/** Circle method. Returns rounds of [white, black|null] pairs. */
export function roundRobinSchedule(players: string[], double: boolean): [string, string | null][][] {
  const list: (string | null)[] = [...players];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: [string, string | null][][] = [];
  const arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      let a = arr[i];
      let b = arr[n - 1 - i];
      // Alternate colours for the fixed player and per board.
      if ((i === 0 && r % 2 === 1) || (i > 0 && i % 2 === 1)) [a, b] = [b, a];
      if (a === null) pairs.push([b!, null]);
      else pairs.push([a, b]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  if (double) return [...rounds, ...rounds.map((r) => r.map(([w, b]) => (b === null ? ([w, null] as [string, null]) : ([b, w] as [string, string]))))];
  return rounds;
}

export function totalRoundsFor(format: Format, players: number, swissRounds: number): number {
  const even = players % 2 ? players + 1 : players;
  if (format === "roundRobin") return even - 1;
  if (format === "doubleRoundRobin") return 2 * (even - 1);
  if (format === "knockout") return Math.ceil(Math.log2(Math.max(2, players)));
  return Math.max(1, Math.min(swissRounds, players - 1));
}

export interface Standing {
  id: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Buchholz (Swiss) or Sonneborn-Berger (round robin). */
  tiebreak: number;
  eliminated?: boolean;
}

export function standings(t: TournamentState, players: string[]): Standing[] {
  const map = new Map<string, Standing>(players.map((id) => [id, { id, points: 0, played: 0, wins: 0, draws: 0, losses: 0, tiebreak: 0 }]));
  const opponents = new Map<string, { opp: string; score: number }[]>();
  for (const p of t.pairings) {
    if (!p.result) continue;
    const w = map.get(p.white);
    if (p.black === null) {
      if (w) {
        w.points += 1;
        w.wins += 1;
      }
      continue;
    }
    const b = map.get(p.black);
    for (const [s, mine, theirs, opp] of [
      [w, p.result.w, p.result.b, p.black],
      [b, p.result.b, p.result.w, p.white],
    ] as const) {
      if (!s) continue;
      s.points += mine;
      s.played += 1;
      if (mine > theirs) s.wins += 1;
      else if (mine < theirs) s.losses += 1;
      else s.draws += 1;
      (opponents.get(s.id) ?? opponents.set(s.id, []).get(s.id)!).push({ opp, score: mine });
    }
  }
  for (const s of map.values()) {
    const opps = opponents.get(s.id) ?? [];
    s.tiebreak =
      t.format === "swiss"
        ? opps.reduce((a, o) => a + (map.get(o.opp)?.points ?? 0), 0)
        : opps.reduce((a, o) => a + o.score * (map.get(o.opp)?.points ?? 0), 0);
  }
  if (t.format === "knockout") {
    for (const p of t.pairings) if (p.winner && p.black !== null) map.get(p.winner === p.white ? p.black : p.white)!.eliminated = true;
  }
  return [...map.values()].sort((a, b) => Number(!!a.eliminated) - Number(!!b.eliminated) || b.points - a.points || b.tiebreak - a.tiebreak || a.id.localeCompare(b.id));
}

const colorBalance = (t: TournamentState, id: string) => t.pairings.reduce((a, p) => a + (p.white === id ? 1 : p.black === id ? -1 : 0), 0);

/** Pairs the next round. Returns [white, black|null] pairs (null = bye). */
export function pairNextRound(t: TournamentState, players: string[]): [string, string | null][] {
  const round = t.round + 1;
  if (t.format === "roundRobin" || t.format === "doubleRoundRobin") {
    const ordered = [...players].sort();
    return roundRobinSchedule(shuffled(ordered, t.seed), t.format === "doubleRoundRobin")[round - 1] ?? [];
  }
  if (t.format === "knockout") {
    if (round === 1) {
      const seeded = shuffled([...players].sort(), t.seed);
      const size = 2 ** Math.ceil(Math.log2(Math.max(2, seeded.length)));
      const byes = size - seeded.length;
      const pairs: [string, string | null][] = [];
      for (let i = 0; i < byes; i++) pairs.push([seeded[i], null]);
      const rest = seeded.slice(byes);
      for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
      return pairs;
    }
    const prev = t.pairings.filter((p) => p.round === round - 1).map((p) => p.winner!);
    const pairs: [string, string | null][] = [];
    for (let i = 0; i < prev.length; i += 2) pairs.push(prev[i + 1] === undefined ? [prev[i], null] : [prev[i], prev[i + 1]]);
    return pairs;
  }
  // Swiss: by score, avoid rematches, bye for the lowest player without one.
  const table = standings(t, players);
  const played = new Set(t.pairings.flatMap((p) => (p.black ? [`${p.white}|${p.black}`, `${p.black}|${p.white}`] : [])));
  const hadBye = new Set(t.pairings.filter((p) => p.black === null).map((p) => p.white));
  let pool = table.map((s) => s.id);
  const pairs: [string, string | null][] = [];
  if (pool.length % 2) {
    const byeIdx = [...pool].reverse().findIndex((id) => !hadBye.has(id));
    const id = byeIdx >= 0 ? pool[pool.length - 1 - byeIdx] : pool[pool.length - 1];
    pairs.push([id, null]);
    pool = pool.filter((x) => x !== id);
  }
  const solve = (rest: string[]): [string, string][] | null => {
    if (!rest.length) return [];
    const [a, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      const b = others[i];
      if (played.has(`${a}|${b}`)) continue;
      const sub = solve([...others.slice(0, i), ...others.slice(i + 1)]);
      if (sub) return [[a, b], ...sub];
    }
    return null;
  };
  const matched = solve(pool) ?? pool.reduce<[string, string][]>((acc, id, i) => (i % 2 ? acc : [...acc, [id, pool[i + 1]]]), []);
  for (const [a, b] of matched) pairs.unshift(colorBalance(t, a) <= colorBalance(t, b) ? [a, b] : [b, a]);
  return pairs;
}

function shuffled<T>(list: T[], seed: number): T[] {
  const rand = rng(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function isFinished(t: TournamentState): boolean {
  const current = t.pairings.filter((p) => p.round === t.round);
  const roundDone = current.length > 0 && current.every((p) => p.result);
  if (t.format === "knockout") return roundDone && current.length === 1 && current[0].black !== null;
  return roundDone && t.round >= t.totalRounds;
}
