import { DEFAULT_POSITION } from "chess.js";

export type Color = "w" | "b";
export type Variant = "standard" | "kingOfTheHill" | "threeCheck";
export type StartMode = "standard" | "shuffle" | "fen";

export interface ClockRules {
  /** Starting time of each side, in ms (different values = time odds). */
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
}

/** Every match (local, mascot, online, tournament) is played with an editable set of rules. */
export interface Rules {
  variant: Variant;
  start: StartMode;
  /** Used when start = "fen". */
  fen?: string;
  /** Used when start = "shuffle"; same seed = same position for both players. */
  shuffleSeed?: number;
  clock: ClockRules | null;
  /** Undo allowed (local / mascot games; online it needs the opponent's agreement). */
  takebacks: boolean;
  /** Engine hints allowed (vs mascot). */
  hints: boolean;
}

export const DEFAULT_RULES: Rules = {
  variant: "standard",
  start: "standard",
  clock: null,
  takebacks: true,
  hints: false,
};

export const VARIANTS: { id: Variant; name: string; description: string }[] = [
  { id: "standard", name: "Standard", description: "Classic chess rules." },
  { id: "kingOfTheHill", name: "King of the Hill", description: "Also win by bringing your king to one of the 4 center squares." },
  { id: "threeCheck", name: "Three-check", description: "Also win by giving check three times." },
];

export const START_MODES: { id: StartMode; name: string; description: string }[] = [
  { id: "standard", name: "Standard", description: "Usual starting position." },
  { id: "shuffle", name: "Shuffle", description: "Random back rank (Chess960-style, bishops on opposite colors, no castling)." },
  { id: "fen", name: "Custom position", description: "Start from any position (FEN or the board editor)." },
];

export const CLOCK_PRESETS: { label: string; clock: ClockRules | null }[] = [
  { label: "No clock", clock: null },
  { label: "1+0", clock: { whiteMs: 60_000, blackMs: 60_000, incrementMs: 0 } },
  { label: "3+2", clock: { whiteMs: 180_000, blackMs: 180_000, incrementMs: 2000 } },
  { label: "5+0", clock: { whiteMs: 300_000, blackMs: 300_000, incrementMs: 0 } },
  { label: "10+0", clock: { whiteMs: 600_000, blackMs: 600_000, incrementMs: 0 } },
  { label: "15+10", clock: { whiteMs: 900_000, blackMs: 900_000, incrementMs: 10_000 } },
  { label: "30+0", clock: { whiteMs: 1_800_000, blackMs: 1_800_000, incrementMs: 0 } },
];

export function describeClock(clock: ClockRules | null): string {
  if (!clock) return "No clock";
  const m = (ms: number) => {
    const min = ms / 60_000;
    return Number.isInteger(min) ? String(min) : min.toFixed(1);
  };
  const base = clock.whiteMs === clock.blackMs ? m(clock.whiteMs) : `${m(clock.whiteMs)}/${m(clock.blackMs)}`;
  return `${base}+${clock.incrementMs / 1000}`;
}

export function describeRules(rules: Rules): string {
  const parts = [describeClock(rules.clock)];
  if (rules.variant !== "standard") parts.push(VARIANTS.find((v) => v.id === rules.variant)!.name);
  if (rules.start === "shuffle") parts.push("Shuffle");
  if (rules.start === "fen") parts.push("Custom start");
  return parts.join(" · ");
}

/** Small deterministic RNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chess960-style back rank: bishops on opposite colors, king between the rooks. Castling is disabled. */
export function shuffleFen(seed: number): string {
  const rand = rng(seed);
  const rank: (string | null)[] = Array(8).fill(null);
  const free = () => rank.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  const pick = (squares: number[]) => squares[Math.floor(rand() * squares.length)];
  rank[pick([0, 2, 4, 6])] = "b";
  rank[pick([1, 3, 5, 7])] = "b";
  rank[pick(free())] = "q";
  rank[pick(free())] = "n";
  rank[pick(free())] = "n";
  const [r1, k, r2] = free();
  rank[r1] = "r";
  rank[k] = "k";
  rank[r2] = "r";
  const black = rank.join("");
  return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${black.toUpperCase()} w - - 0 1`;
}

export function startFen(rules: Rules): string {
  if (rules.start === "fen" && rules.fen) return rules.fen;
  if (rules.start === "shuffle") return shuffleFen(rules.shuffleSeed ?? 1);
  return DEFAULT_POSITION;
}

/** Fills missing fields of rules coming from storage or the network. */
export function normalizeRules(input: Partial<Rules> | undefined): Rules {
  return { ...DEFAULT_RULES, ...(input ?? {}) };
}
