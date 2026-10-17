import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Attempt {
  attempts: number;
  solved: number;
  /** Last outcome. */
  last: "solved" | "failed";
  at: number;
}

interface TrainState {
  results: Record<string, Attempt>;
  xp: number;
  streak: number;
  best: Record<string, number>;
  record: (id: string, ok: boolean, xp?: number) => void;
  setBest: (mode: string, score: number) => void;
}

/** Training progress, kept in the browser. Failed exercises come back first. */
export const useTrain = create<TrainState>()(
  persist(
    (set) => ({
      results: {},
      xp: 0,
      streak: 0,
      best: {},
      record: (id, ok, xp = 10) =>
        set((s) => {
          const prev = s.results[id];
          return {
            results: { ...s.results, [id]: { attempts: (prev?.attempts ?? 0) + 1, solved: (prev?.solved ?? 0) + (ok ? 1 : 0), last: ok ? "solved" : "failed", at: Date.now() } },
            xp: s.xp + (ok ? xp : 0),
            streak: ok ? s.streak + 1 : 0,
          };
        }),
      setBest: (mode, score) => set((s) => ({ best: { ...s.best, [mode]: Math.max(score, s.best[mode] ?? 0) } })),
    }),
    { name: "chesslab-train", version: 1 }
  )
);

/** Order: failed before, then never seen, then solved long ago. */
export function prioritize<T extends { id: string }>(items: T[], results: Record<string, Attempt>): T[] {
  const rank = (id: string) => {
    const r = results[id];
    if (!r) return 1;
    if (r.last === "failed") return 0;
    return 2 + r.solved;
  };
  return [...items].sort((a, b) => rank(a.id) - rank(b.id) || (results[a.id]?.at ?? 0) - (results[b.id]?.at ?? 0));
}
