import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { computeStats } from "@/core/analysis/stats";
import type { GameSummary } from "@/core/chesscom/api";
import { useReview } from "@/store/review";
import { useSettings } from "@/store/settings";
import { Icon } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";
import { useAnalysis } from "./analysisStore";
import { insights } from "./insights";
import { OverviewTab } from "./OverviewTab";
import { GamesTab } from "./GamesTab";
import { OpeningsTab } from "./OpeningsTab";
import { MistakesTab } from "./MistakesTab";

type Tab = "overview" | "games" | "openings" | "mistakes";
const PERIODS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 0, label: "All time" },
];
const TIME_CLASSES = ["bullet", "blitz", "rapid", "daily"];

export default function AnalyzePage() {
  const [params, setParams] = useSearchParams();
  const saved = useSettings((s) => s.chessComUser);
  const st = useAnalysis();
  const [input, setInput] = useState(params.get("user") ?? st.user ?? saved);
  const [months, setMonths] = useState(3);
  const [tab, setTab] = useState<Tab>("overview");
  const [timeClass, setTimeClass] = useState<string>("all");
  const [color, setColor] = useState<"all" | "w" | "b">("all");
  const navigate = useNavigate();
  const openReview = useReview((s) => s.open);

  useEffect(() => {
    const u = params.get("user");
    if (u && u.toLowerCase() !== st.user) void st.load(u, months);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const games = useMemo(
    () => st.games.filter((g) => (timeClass === "all" || g.timeClass === timeClass) && (color === "all" || g.color === color)),
    [st.games, timeClass, color]
  );
  const stats = useMemo(() => computeStats(games, st.analyses, st.clocks), [games, st.analyses, st.clocks]);
  const tips = useMemo(() => insights(stats), [stats]);
  const presentClasses = TIME_CLASSES.filter((c) => st.games.some((g) => g.timeClass === c));

  const open = (g: GameSummary, ply?: number) => {
    openReview({ id: g.id, pgn: g.pgn, white: g.color === "w" ? st.profile?.username ?? st.user : g.opponent, black: g.color === "b" ? st.profile?.username ?? st.user : g.opponent, orientation: g.color, ply });
    navigate("/review");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setParams({ user: input.trim() });
    void st.load(input.trim(), months);
  };

  const unanalyzed = games.filter((g) => !st.analyses.has(g.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1>Analyze</h1>
        <form onSubmit={submit} className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input className="input min-w-0 flex-1 sm:w-56" placeholder="chess.com username" value={input} onChange={(e) => setInput(e.target.value)} autoCapitalize="off" autoCorrect="off" />
          <select className="input w-auto" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Period">
            {PERIODS.map((p) => (
              <option key={p.months} value={p.months}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={!!st.loading}>
            <Icon name="search" /> Load
          </button>
        </form>
      </div>

      {st.error && <div className="card border-danger/50 bg-danger/10 text-sm text-danger">{st.error}</div>}
      {st.loading && (
        <div className="card flex items-center gap-4">
          <Mascot size={48} mood="thinking" />
          <div className="flex-1">
            <p className="text-sm">
              Fetching games from chess.com… {st.loading.done}/{st.loading.total} months
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-hover">
              <div className="h-full bg-accent transition-all" style={{ width: `${(st.loading.done / Math.max(1, st.loading.total)) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {!st.profile && !st.loading && !st.error && (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <Mascot size={90} mood="talking" />
          <p className="max-w-md text-text-secondary">Type a chess.com username above. I'll fetch the public games and build your stats. Then let the engine dig into your moves.</p>
        </div>
      )}

      {st.profile && (
        <>
          <ProfileHeader />
          <div className="flex flex-wrap items-center gap-2">
            <button className={timeClass === "all" ? "chip-active" : "chip"} onClick={() => setTimeClass("all")}>
              All
            </button>
            {presentClasses.map((c) => (
              <button key={c} className={timeClass === c ? "chip-active" : "chip"} onClick={() => setTimeClass(c)}>
                {c[0].toUpperCase() + c.slice(1)}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-border" />
            {(["all", "w", "b"] as const).map((c) => (
              <button key={c} className={color === c ? "chip-active" : "chip"} onClick={() => setColor(c)}>
                {c === "all" ? "Both colors" : c === "w" ? "White" : "Black"}
              </button>
            ))}
            <span className="ml-auto text-sm muted">{games.length} games</span>
          </div>

          <EnginePanel ids={games.map((g) => g.id)} unanalyzed={unanalyzed.length} />

          {tips.length > 0 && (
            <div className="card flex gap-3">
              <Mascot size={56} mood="talking" className="shrink-0" />
              <ul className="space-y-1 text-sm">
                {tips.map((t) => (
                  <li key={t}>• {t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border pb-2">
            {(
              [
                ["overview", "Overview"],
                ["games", "Games"],
                ["openings", "Openings"],
                ["mistakes", "Best & worst moves"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} className={tab === id ? "tab-active" : "tab"} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" && <OverviewTab stats={stats} games={games} onOpen={open} />}
          {tab === "games" && <GamesTab games={games} onOpen={open} />}
          {tab === "openings" && <OpeningsTab stats={stats} games={games} />}
          {tab === "mistakes" && <MistakesTab stats={stats} onOpen={open} />}
        </>
      )}
    </div>
  );
}

function ProfileHeader() {
  const { profile, ratings } = useAnalysis();
  if (!profile) return null;
  const r = (key: string) => (ratings?.[key] as { last?: { rating: number } } | undefined)?.last?.rating;
  return (
    <div className="card flex flex-wrap items-center gap-4">
      {profile.avatar ? <img src={profile.avatar} alt="" className="h-14 w-14 rounded-tile object-cover" /> : <div className="h-14 w-14 rounded-tile bg-surface-hover" />}
      <div className="min-w-0 flex-1">
        <a href={profile.url} target="_blank" rel="noreferrer" className="text-lg font-bold hover:underline">
          {profile.title && <span className="mr-1 rounded bg-danger px-1 text-xs text-white">{profile.title}</span>}
          {profile.username}
        </a>
        {profile.name && <div className="text-sm muted">{profile.name}</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["chess_bullet", "Bullet"],
          ["chess_blitz", "Blitz"],
          ["chess_rapid", "Rapid"],
          ["chess_daily", "Daily"],
        ].map(([k, label]) =>
          r(k) ? (
            <div key={k} className="rounded-tile bg-surface-hover px-3 py-1.5 text-center">
              <div className="text-[11px] uppercase tracking-wide muted">{label}</div>
              <div className="font-bold tabular-nums">{r(k)}</div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

function EnginePanel({ ids, unanalyzed }: { ids: string[]; unanalyzed: number }) {
  const { queue, analyze, cancel, depth, setDepth, analyses, analysisError } = useAnalysis();
  const analyzed = ids.filter((id) => analyses.has(id)).length;
  const pending = ids.filter((id) => !analyses.has(id));
  return (
    <div className="card flex flex-wrap items-center gap-3">
      <div className="flex min-w-[200px] flex-1 items-center gap-3">
        <Mascot size={44} mood={queue.running ? "thinking" : analysisError ? "sad" : analyzed ? "happy" : "idle"} />
        <div className="flex-1">
          <div className="text-sm font-semibold">
            Engine analysis · {analyzed}/{ids.length} games
          </div>
          {queue.running ? (
            <>
              <div className="text-xs muted">
                Game {queue.done + 1} of {queue.total} · Stockfish depth {depth}
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-surface-hover">
                <div className="h-full bg-accent transition-all" style={{ width: `${((queue.done + queue.current) / Math.max(1, queue.total)) * 100}%` }} />
              </div>
            </>
          ) : analysisError ? (
            <div className="text-xs font-medium text-danger">{analysisError}</div>
          ) : (
            <div className="text-xs muted">Accuracy, best/worst moves and exercises need engine analysis. It runs in your browser.</div>
          )}
        </div>
      </div>
      {queue.running ? (
        <button className="btn" onClick={cancel}>
          <Icon name="x" /> Stop
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5" value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Depth">
            <option value={10}>Fast (depth 10)</option>
            <option value={12}>Normal (depth 12)</option>
            <option value={15}>Deep (depth 15)</option>
          </select>
          {[10, 25].map((n) =>
            unanalyzed > n ? (
              <button key={n} className="btn" onClick={() => analyze(pending.slice(0, n))}>
                Last {n}
              </button>
            ) : null
          )}
          <button className="btn-primary" disabled={!unanalyzed} onClick={() => analyze(pending)}>
            <Icon name="chart" /> Analyze {unanalyzed ? `all ${unanalyzed}` : "— done"}
          </button>
        </div>
      )}
    </div>
  );
}
