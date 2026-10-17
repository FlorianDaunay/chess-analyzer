import { create } from "zustand";
import type { Mood } from "./Mascot";

interface GuideState {
  message: string | null;
  mood: Mood;
  /** Open the bubble (the owl button is always visible when the guide is enabled). */
  open: boolean;
  say: (message: string, mood?: Mood) => void;
  setOpen: (open: boolean) => void;
}

/** Pages make the guide speak: tips, analysis summaries, encouragements. */
export const useGuide = create<GuideState>((set) => ({
  message: null,
  mood: "idle",
  open: false,
  say: (message, mood = "talking") => set({ message, mood, open: true }),
  setOpen: (open) => set({ open }),
}));

export const PAGE_TIPS: Record<string, string[]> = {
  "/": [
    "Hoo! I'm Hoot, your chess guide. Pick something to do — I'll help along the way.",
    "Start with Analyze: type your chess.com username and I'll go through your games.",
    "Want a game? My family plays from 400 to 3000 Elo. My little cousin Pip is very friendly.",
  ],
  "/analyze": [
    "Enter a chess.com username. I only read public games, nothing is sent anywhere else.",
    "Analysis runs in your browser with Stockfish. Long games take a few seconds each.",
    "Open a game to replay it. Play a different move on the board to explore 'what if'.",
  ],
  "/review": [
    "Use ← → keys (or the buttons) to step through the game.",
    "Play any move on the board: I'll create a variation and evaluate it.",
    "Green arrow = best move. Coloured badges show how good each move was.",
  ],
  "/play": [
    "Choose an opponent and edit the rules: clock, variant, start position, takebacks, hints.",
    "Two players on one device? Pick 'Local' and the board can flip after each move.",
  ],
  "/online": [
    "Create a room and share its code. Games go directly between browsers (peer-to-peer).",
    "If the host leaves, another player takes over automatically.",
  ],
  "/tournament": [
    "Create a tournament room, share the code, and start when everyone has joined.",
    "Formats: round robin, Swiss, or knockout. Every game uses the rules you set.",
  ],
  "/train": [
    "Exercises come from your own analyzed games: your mistakes become your lessons.",
    "Not only mates: find the best move, spot hanging pieces, evaluate, play openings, convert endgames.",
  ],
  "/board": [
    "Free board: drag pieces anywhere, drop them off the board to remove them.",
    "Pick a piece in the palette, then tap squares to place it. Then analyze or play from here.",
  ],
  "/settings": ["Over 50 themes! Try a few — the board colours are separate."],
};
