import type { Analysis } from "../engine/uci";
import { scoreToCp } from "../engine/uci";
import { rng } from "../chess/rules";

export type Accessory = "eggshell" | "scarf" | "none" | "glasses" | "hood" | "crown" | "visor";

/** The mascot's opponents: one owl family, each level with its own look and playing strength. */
export interface Persona {
  id: string;
  name: string;
  elo: number;
  tagline: string;
  body: string;
  belly: string;
  accessory: Accessory;
  /** Engine search. */
  depth: number;
  multipv: number;
  skill: number;
  /**
   * Choice among the engine's candidate moves: higher = more willing to play worse moves
   * (softmax temperature in centipawns). 0 = always the best move.
   */
  temperature: number;
  /** Chance of playing a random legal move instead (beginner levels). */
  randomRate: number;
  /** Thinking time shown to the player (ms), to feel human. */
  thinkMs: [number, number];
}

export const PERSONAS: Persona[] = [
  { id: "pip", name: "Pip", elo: 400, tagline: "Just hatched. Loves moving pieces, not so much keeping them.", body: "#f6c445", belly: "#fff1c4", accessory: "eggshell", depth: 2, multipv: 8, skill: 0, temperature: 400, randomRate: 0.3, thinkMs: [600, 1400] },
  { id: "scout", name: "Scout", elo: 800, tagline: "Knows the rules and a few tricks. Sometimes forgets a piece.", body: "#6fb7e0", belly: "#e3f3fb", accessory: "scarf", depth: 4, multipv: 6, skill: 3, temperature: 180, randomRate: 0.08, thinkMs: [700, 1600] },
  { id: "hoot", name: "Hoot", elo: 1200, tagline: "Your guide. Plays solid club chess and explains a lot.", body: "#a5774f", belly: "#f1dfc6", accessory: "none", depth: 6, multipv: 5, skill: 7, temperature: 90, randomRate: 0.02, thinkMs: [800, 1800] },
  { id: "professor", name: "Professor Hoot", elo: 1600, tagline: "Studied every opening book. Punishes loose pieces.", body: "#7d8a5a", belly: "#e8ecd6", accessory: "glasses", depth: 9, multipv: 4, skill: 11, temperature: 45, randomRate: 0, thinkMs: [900, 2000] },
  { id: "night", name: "Night Owl", elo: 2000, tagline: "Calculates deep into the night. Rarely blunders.", body: "#3d4a7a", belly: "#cfd6f0", accessory: "hood", depth: 12, multipv: 3, skill: 15, temperature: 20, randomRate: 0, thinkMs: [1000, 2200] },
  { id: "grand", name: "Grand Owl", elo: 2400, tagline: "Master strength. Precise and patient.", body: "#7a4a9a", belly: "#ecdcf6", accessory: "crown", depth: 15, multipv: 2, skill: 19, temperature: 8, randomRate: 0, thinkMs: [1000, 2400] },
  { id: "oracle", name: "Oracle", elo: 3000, tagline: "Full engine strength. Good luck.", body: "#2b2f36", belly: "#9fe8d8", accessory: "visor", depth: 18, multipv: 1, skill: 20, temperature: 0, randomRate: 0, thinkMs: [500, 1200] },
];

export const GUIDE = PERSONAS.find((p) => p.id === "hoot")!;
export const findPersona = (id: string) => PERSONAS.find((p) => p.id === id) ?? GUIDE;

/**
 * Picks the persona's move among the engine candidates. Pure (randomness from `seed`), so it
 * is testable. `legal` is used for the occasional random move of beginner levels.
 */
export function chooseMove(persona: Persona, analysis: Analysis, legal: string[], seed: number): string | null {
  const rand = rng(seed);
  if (!legal.length) return null;
  if (persona.randomRate > 0 && rand() < persona.randomRate) return legal[Math.floor(rand() * legal.length)];
  const whiteToMove = analysis.fen.split(" ")[1] !== "b";
  const candidates = analysis.lines.filter((l) => l.pv[0]);
  if (!candidates.length) return analysis.bestmove ?? legal[0];
  if (persona.temperature <= 0) return candidates[0].pv[0];
  const values = candidates.map((l) => (whiteToMove ? 1 : -1) * scoreToCp(l.score));
  const best = Math.max(...values);
  const weights = values.map((v) => Math.exp(-Math.min(2000, best - v) / persona.temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].pv[0];
  }
  return candidates[0].pv[0];
}
