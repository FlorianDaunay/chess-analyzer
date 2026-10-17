import { create } from "zustand";
import { ChessComError, fetchArchives, fetchMonth, fetchProfile, fetchStats, summarize, type CCProfile, type CCRawGame, type CCStats, type GameSummary } from "@/core/chesscom/api";
import { AnalysisPool, analyzePgn } from "@/core/analysis/analyzer";
import { EngineError } from "@/core/engine/engine";
import { ANALYSIS_VERSION, type GameAnalysis } from "@/core/analysis/classify";
import { parsePgn } from "@/core/chess/pgn";
import { idbGet, idbGetMany, idbSet } from "@/store/idb";
import { useSettings } from "@/store/settings";

export interface QueueState {
  running: boolean;
  done: number;
  total: number;
  /** Progress inside the current game, 0..1. */
  current: number;
  currentId: string | null;
}

interface AnalysisState {
  user: string;
  profile: CCProfile | null;
  ratings: CCStats | null;
  games: GameSummary[];
  loading: { done: number; total: number } | null;
  error: string | null;
  analyses: Map<string, GameAnalysis>;
  clocks: Map<string, (number | undefined)[]>;
  queue: QueueState;
  /** Problem during the engine analysis (shown above the results). */
  analysisError: string | null;
  depth: number;
  load: (user: string, months: number) => Promise<void>;
  analyze: (ids: string[]) => Promise<void>;
  cancel: () => void;
  setDepth: (d: number) => void;
  /** Analysis of any game (local, editor…), cached like chess.com games. */
  analyzeOne: (id: string, pgn: string, onProgress?: (p: number) => void) => Promise<GameAnalysis>;
  getAnalysis: (id: string) => Promise<GameAnalysis | undefined>;
}

let pool: AnalysisPool | null = null;
const getPool = () => (pool ??= new AnalysisPool());
let abort: AbortController | null = null;
let cancelled = false;

const monthKey = (user: string, url: string) => `${user.toLowerCase()}|${url}`;

export const useAnalysis = create<AnalysisState>((set, get) => ({
  user: "",
  profile: null,
  ratings: null,
  games: [],
  loading: null,
  error: null,
  analyses: new Map(),
  clocks: new Map(),
  queue: { running: false, done: 0, total: 0, current: 0, currentId: null },
  analysisError: null,
  depth: 12,

  setDepth: (depth) => set({ depth }),

  load: async (userInput, months) => {
    const user = userInput.trim().toLowerCase();
    if (!user) return;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    set({ user, error: null, loading: { done: 0, total: 1 }, ...(user !== get().user ? { games: [], profile: null, ratings: null } : {}) });
    try {
      const [profile, ratings, archives] = await Promise.all([fetchProfile(user, signal), fetchStats(user, signal).catch(() => null), fetchArchives(user, signal)]);
      set({ profile, ratings });
      useSettings.getState().set({ chessComUser: profile.username ?? user });
      const wanted = months > 0 ? archives.slice(-months) : archives;
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      set({ loading: { done: 0, total: wanted.length } });
      const raw: CCRawGame[] = [];
      let done = 0;
      // Past months never change: cache them. A few requests at a time (chess.com asks for serial access).
      const queue = [...wanted].reverse();
      const worker = async () => {
        for (let url = queue.shift(); url; url = queue.shift()) {
          const isCurrent = url.endsWith(currentMonth);
          let games = isCurrent ? undefined : await idbGet<CCRawGame[]>("games", monthKey(user, url));
          if (!games) {
            games = await fetchMonth(url, signal);
            if (!isCurrent) void idbSet("games", monthKey(user, url), games);
          }
          raw.push(...games);
          set({ loading: { done: ++done, total: wanted.length } });
        }
      };
      await Promise.all([worker(), worker()]);
      const games = raw
        .map((g) => summarize(g, user))
        .filter((g): g is GameSummary => !!g)
        .sort((a, b) => b.endTime - a.endTime);
      const cached = await idbGetMany<GameAnalysis>("analysis", games.map((g) => g.id));
      const analyses = new Map(get().analyses);
      const clocks = new Map(get().clocks);
      for (const [id, a] of cached) {
        if (a.version !== ANALYSIS_VERSION) continue;
        analyses.set(id, a);
        const g = games.find((x) => x.id === id);
        if (g) clocks.set(id, parsePgn(g.pgn).clocks);
      }
      set({ games, analyses, clocks, loading: null });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      set({ loading: null, error: e instanceof ChessComError ? e.message : `Something went wrong: ${(e as Error).message}` });
    }
  },

  analyze: async (ids) => {
    if (get().queue.running) return;
    cancelled = false;
    const todo = ids.filter((id) => !get().analyses.has(id));
    set({ queue: { running: true, done: 0, total: todo.length, current: 0, currentId: null }, analysisError: null });
    let failed = 0;
    let lastError = "";
    for (const id of todo) {
      if (cancelled) break;
      const game = get().games.find((g) => g.id === id);
      if (!game) continue;
      set((s) => ({ queue: { ...s.queue, currentId: id, current: 0 } }));
      try {
        const a = await analyzePgn(getPool(), id, game.pgn, get().depth, (d, t) => set((s) => ({ queue: { ...s.queue, current: d / t } })));
        if (cancelled) break;
        void idbSet("analysis", id, a);
        set((s) => {
          const analyses = new Map(s.analyses);
          analyses.set(id, a);
          const clocks = new Map(s.clocks);
          clocks.set(id, parsePgn(game.pgn).clocks);
          return { analyses, clocks, queue: { ...s.queue, done: s.queue.done + 1 } };
        });
      } catch (e) {
        if (cancelled) break;
        failed++;
        lastError = e instanceof Error ? e.message : String(e);
        console.error("Analysis failed for", id, e);
        // The engine itself is broken: no use trying the other games.
        if (e instanceof EngineError) break;
      }
    }
    set((s) => ({
      queue: { ...s.queue, running: false, currentId: null },
      analysisError: failed ? `${failed} game${failed > 1 ? "s" : ""} could not be analyzed. ${lastError}` : null,
    }));
  },

  cancel: () => {
    cancelled = true;
    pool?.stop();
    set((s) => ({ queue: { ...s.queue, running: false, currentId: null } }));
  },

  analyzeOne: async (id, pgn, onProgress) => {
    const known = get().analyses.get(id) ?? (await get().getAnalysis(id));
    if (known) return known;
    const a = await analyzePgn(getPool(), id, pgn, get().depth, (d, t) => onProgress?.(d / t));
    void idbSet("analysis", id, a);
    set((s) => {
      const analyses = new Map(s.analyses);
      analyses.set(id, a);
      return { analyses };
    });
    return a;
  },

  getAnalysis: async (id) => {
    const mem = get().analyses.get(id);
    if (mem) return mem;
    const a = await idbGet<GameAnalysis>("analysis", id);
    return a && a.version === ANALYSIS_VERSION ? a : undefined;
  },
}));
