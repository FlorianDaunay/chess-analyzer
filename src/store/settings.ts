import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  boardTheme: string;
  coordinates: boolean;
  animations: boolean;
  sound: boolean;
  showLegal: boolean;
  /** The mascot guide bubble on every page. */
  mascotGuide: boolean;
  playerName: string;
  /** Last chess.com username analyzed. */
  chessComUser: string;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      boardTheme: "green",
      coordinates: true,
      animations: true,
      sound: true,
      showLegal: true,
      mascotGuide: true,
      playerName: "",
      chessComUser: "",
      set: (patch) => set(patch),
    }),
    { name: "chesslab-settings", version: 1 }
  )
);
