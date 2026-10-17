import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_RULES, type Color, type Rules } from "@/core/chess/rules";
import { normalizeGame, type GameState } from "@/core/chess/game";

export interface PlaySetup {
  mode: "mascot" | "local";
  personaId: string;
  color: Color | "random";
  rules: Rules;
  /** Local games: turn the board towards the side to move. */
  autoFlip: boolean;
}

interface PlayState {
  setup: PlaySetup;
  game: GameState | null;
  /** Colour of the human vs the mascot. */
  human: Color;
  setSetup: (patch: Partial<PlaySetup>) => void;
  setGame: (game: GameState | null, human?: Color) => void;
}

export const usePlay = create<PlayState>()(
  persist(
    (set) => ({
      setup: { mode: "mascot", personaId: "hoot", color: "w", rules: { ...DEFAULT_RULES, hints: true }, autoFlip: false },
      game: null,
      human: "w",
      setSetup: (patch) => set((s) => ({ setup: { ...s.setup, ...patch } })),
      setGame: (game, human) => set((s) => ({ game, human: human ?? s.human })),
    }),
    {
      name: "chesslab-play",
      version: 1,
      merge: (persisted, current) => {
        const p = persisted as Partial<PlayState>;
        return { ...current, ...p, setup: { ...current.setup, ...(p.setup ?? {}) }, game: p.game ? normalizeGame(p.game) : null };
      },
    }
  )
);
