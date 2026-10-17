import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A game to open in the review board. */
export interface ReviewInput {
  /** Stable id (chess.com url, or local id) used to cache the analysis. */
  id: string;
  pgn: string;
  white: string;
  black: string;
  /** Point of view: the user's colour if known. */
  orientation?: "w" | "b";
  /** Start the review at this ply. */
  ply?: number;
}

interface ReviewState {
  input: ReviewInput | null;
  open: (input: ReviewInput) => void;
}

export const useReview = create<ReviewState>()(
  persist((set) => ({ input: null, open: (input) => set({ input }) }), { name: "chesslab-review", version: 1 })
);
