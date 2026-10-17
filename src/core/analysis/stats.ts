import type { GameSummary, Outcome } from "../chesscom/api";
import type { GameAnalysis, MoveAnalysis, Phase } from "./classify";
import type { MoveClass } from "@/ui/palette";

export interface WDL {
  win: number;
  draw: number;
  loss: number;
}
const emptyWdl = (): WDL => ({ win: 0, draw: 0, loss: 0 });
export const total = (w: WDL) => w.win + w.draw + w.loss;
/** Score in % (win = 1, draw = 0.5). */
export const scorePct = (w: WDL) => (total(w) ? ((w.win + w.draw / 2) / total(w)) * 100 : 0);

function add(w: WDL, o: Outcome) {
  w[o] += 1;
}

/** "Sicilian Defense Najdorf Variation 6.Be3" → "Sicilian Defense". */
export function openingFamilyName(name: string): string {
  const words = name.split(" ");
  const end = words.findIndex((w) => /^(Defense|Defence|Opening|Game|Gambit|Attack|System|Countergambit)$/.test(w));
  return end >= 0 ? words.slice(0, end + 1).join(" ") : words.slice(0, 3).join(" ");
}

export interface OpeningStat {
  name: string;
  color: "w" | "b";
  wdl: WDL;
  games: number;
  accuracy: number | null;
  lastPlayed: number;
}

export interface MoveRef {
  gameId: string;
  game: GameSummary;
  move: MoveAnalysis;
}

export interface Stats {
  games: number;
  wdl: WDL;
  byColor: Record<"w" | "b", WDL>;
  byTimeClass: Record<string, WDL & { rating: number }>;
  ratings: Record<string, { t: number; rating: number }[]>;
  winsBy: Record<string, number>;
  lossesBy: Record<string, number>;
  openings: OpeningStat[];
  byHour: WDL[];
  byWeekday: WDL[];
  byRatingDiff: { label: string; wdl: WDL }[];
  longestWinStreak: number;
  currentStreak: { outcome: Outcome; length: number } | null;
  bestWins: GameSummary[];
  avgLength: { win: number; loss: number; draw: number };
  engine: EngineStats | null;
}

export interface EngineStats {
  analyzed: number;
  accuracy: number;
  opponentAccuracy: number;
  accuracyTrend: { t: number; accuracy: number; id: string }[];
  perGame: Partial<Record<MoveClass, number>>;
  phaseAccuracy: Partial<Record<Phase, number>>;
  worstMoves: MoveRef[];
  bestMoves: MoveRef[];
  /** Share of the player's blunders made with less than 10% of the starting clock. */
  timeTroubleBlunders: { blunders: number; inTimeTrouble: number };
  /** Accuracy split by result. */
  accuracyByOutcome: Partial<Record<Outcome, number>>;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function computeStats(games: GameSummary[], analyses: Map<string, GameAnalysis>, clocks?: Map<string, (number | undefined)[]>): Stats {
  const sorted = [...games].sort((a, b) => a.endTime - b.endTime);
  const s: Stats = {
    games: games.length,
    wdl: emptyWdl(),
    byColor: { w: emptyWdl(), b: emptyWdl() },
    byTimeClass: {},
    ratings: {},
    winsBy: {},
    lossesBy: {},
    openings: [],
    byHour: Array.from({ length: 24 }, emptyWdl),
    byWeekday: Array.from({ length: 7 }, emptyWdl),
    byRatingDiff: [],
    longestWinStreak: 0,
    currentStreak: null,
    bestWins: [],
    avgLength: { win: 0, loss: 0, draw: 0 },
    engine: null,
  };
  const openingMap = new Map<string, OpeningStat & { accs: number[] }>();
  const diffBuckets = [
    { label: "< −200", min: -Infinity, max: -200 },
    { label: "−200…−100", min: -200, max: -100 },
    { label: "−100…0", min: -100, max: 0 },
    { label: "0…+100", min: 0, max: 100 },
    { label: "+100…+200", min: 100, max: 200 },
    { label: "> +200", min: 200, max: Infinity },
  ].map((b) => ({ ...b, wdl: emptyWdl() }));
  const lengths: Record<Outcome, number[]> = { win: [], loss: [], draw: [] };
  let streak = 0;

  for (const g of sorted) {
    add(s.wdl, g.outcome);
    add(s.byColor[g.color], g.outcome);
    const tc = (s.byTimeClass[g.timeClass] ??= { ...emptyWdl(), rating: 0 });
    add(tc, g.outcome);
    tc.rating = g.rating;
    (s.ratings[g.timeClass] ??= []).push({ t: g.endTime * 1000, rating: g.rating });
    if (g.outcome === "win") s.winsBy[g.how] = (s.winsBy[g.how] ?? 0) + 1;
    if (g.outcome === "loss") s.lossesBy[g.how] = (s.lossesBy[g.how] ?? 0) + 1;
    const d = new Date(g.endTime * 1000);
    add(s.byHour[d.getHours()], g.outcome);
    add(s.byWeekday[(d.getDay() + 6) % 7], g.outcome);
    const diff = g.opponentRating - g.rating;
    const bucket = diffBuckets.find((b) => diff >= b.min && diff < b.max);
    if (bucket) add(bucket.wdl, g.outcome);
    lengths[g.outcome].push(Math.ceil(g.plies / 2));

    const family = openingFamilyName(g.opening);
    const key = `${g.color}|${family}`;
    const o = openingMap.get(key) ?? { name: family, color: g.color, wdl: emptyWdl(), games: 0, accuracy: null, lastPlayed: 0, accs: [] };
    add(o.wdl, g.outcome);
    o.games += 1;
    o.lastPlayed = Math.max(o.lastPlayed, g.endTime);
    const a = analyses.get(g.id);
    if (a) o.accs.push(a.accuracy[g.color]);
    else if (g.ccAccuracy !== undefined) o.accs.push(g.ccAccuracy);
    openingMap.set(key, o);

    if (g.outcome === "win") {
      streak += 1;
      s.longestWinStreak = Math.max(s.longestWinStreak, streak);
    } else streak = 0;
  }

  // Current streak from the latest game backwards.
  if (sorted.length) {
    const last = sorted[sorted.length - 1].outcome;
    let n = 0;
    for (let i = sorted.length - 1; i >= 0 && sorted[i].outcome === last; i--) n++;
    s.currentStreak = { outcome: last, length: n };
  }

  s.openings = [...openingMap.values()]
    .map(({ accs, ...o }) => ({ ...o, accuracy: accs.length ? avg(accs) : null }))
    .sort((a, b) => b.games - a.games);
  s.byRatingDiff = diffBuckets.map((b) => ({ label: b.label, wdl: b.wdl }));
  s.bestWins = sorted
    .filter((g) => g.outcome === "win")
    .sort((a, b) => b.opponentRating - a.opponentRating)
    .slice(0, 5);
  s.avgLength = { win: avg(lengths.win), loss: avg(lengths.loss), draw: avg(lengths.draw) };
  s.engine = engineStats(sorted, analyses, clocks);
  return s;
}

function engineStats(games: GameSummary[], analyses: Map<string, GameAnalysis>, clocks?: Map<string, (number | undefined)[]>): EngineStats | null {
  const analyzed = games.filter((g) => analyses.has(g.id));
  if (!analyzed.length) return null;
  const accs: number[] = [];
  const oppAccs: number[] = [];
  const trend: EngineStats["accuracyTrend"] = [];
  const classTotals: Partial<Record<MoveClass, number>> = {};
  const phase: Partial<Record<Phase, number[]>> = {};
  const worst: MoveRef[] = [];
  const best: MoveRef[] = [];
  const byOutcome: Partial<Record<Outcome, number[]>> = {};
  let blunders = 0;
  let inTimeTrouble = 0;

  for (const g of analyzed) {
    const a = analyses.get(g.id)!;
    const me = g.color;
    const opp = me === "w" ? "b" : "w";
    accs.push(a.accuracy[me]);
    oppAccs.push(a.accuracy[opp]);
    (byOutcome[g.outcome] ??= []).push(a.accuracy[me]);
    trend.push({ t: g.endTime * 1000, accuracy: a.accuracy[me], id: g.id });
    for (const [cls, n] of Object.entries(a.counts[me])) classTotals[cls as MoveClass] = (classTotals[cls as MoveClass] ?? 0) + (n ?? 0);
    for (const [ph, v] of Object.entries(a.phaseAccuracy[me])) (phase[ph as Phase] ??= []).push(v!);
    const startClock = Number(g.timeControl.split("+")[0]) || 0;
    const clk = clocks?.get(g.id);
    for (const m of a.moves) {
      if (m.color !== me) continue;
      if (m.cls === "blunder" || m.cls === "mistake" || m.cls === "miss") worst.push({ gameId: g.id, game: g, move: m });
      if (m.cls === "brilliant" || m.cls === "great") best.push({ gameId: g.id, game: g, move: m });
      if (m.cls === "blunder") {
        blunders++;
        const left = clk?.[m.ply - 1];
        if (startClock > 0 && left !== undefined && left < startClock * 0.1) inTimeTrouble++;
      }
    }
  }
  const perGame: Partial<Record<MoveClass, number>> = {};
  for (const [k, v] of Object.entries(classTotals)) perGame[k as MoveClass] = (v ?? 0) / analyzed.length;
  const phaseAccuracy: Partial<Record<Phase, number>> = {};
  for (const [k, v] of Object.entries(phase)) phaseAccuracy[k as Phase] = avg(v!);
  const accuracyByOutcome: Partial<Record<Outcome, number>> = {};
  for (const [k, v] of Object.entries(byOutcome)) accuracyByOutcome[k as Outcome] = avg(v!);

  return {
    analyzed: analyzed.length,
    accuracy: avg(accs),
    opponentAccuracy: avg(oppAccs),
    accuracyTrend: trend,
    perGame,
    phaseAccuracy,
    worstMoves: worst.sort((a, b) => b.move.wpLoss - a.move.wpLoss).slice(0, 30),
    bestMoves: best.sort((a, b) => (a.move.cls === "brilliant" ? -1 : 0) - (b.move.cls === "brilliant" ? -1 : 0) || b.game.endTime - a.game.endTime).slice(0, 30),
    timeTroubleBlunders: { blunders, inTimeTrouble },
    accuracyByOutcome,
  };
}

/** Opening tree of the player's games (SAN moves), for the repertoire explorer. */
export interface RepNode {
  san: string;
  wdl: WDL;
  children: Map<string, RepNode>;
}

export function sanMovesOf(pgn: string): string[] {
  const text = pgn.split(/\r?\n\r?\n/).slice(1).join(" ");
  return text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/\$\d+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function buildRepertoire(games: GameSummary[], color: "w" | "b", depth = 14): RepNode {
  const root: RepNode = { san: "", wdl: emptyWdl(), children: new Map() };
  for (const g of games) {
    if (g.color !== color) continue;
    add(root.wdl, g.outcome);
    let node = root;
    for (const san of sanMovesOf(g.pgn).slice(0, depth)) {
      let child = node.children.get(san);
      if (!child) {
        child = { san, wdl: emptyWdl(), children: new Map() };
        node.children.set(san, child);
      }
      add(child.wdl, g.outcome);
      node = child;
    }
  }
  return root;
}
