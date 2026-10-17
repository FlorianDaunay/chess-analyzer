import { scorePct, total, type Stats } from "@/core/analysis/stats";
import { HOW_LABEL, type GameSummary } from "@/core/chesscom/api";
import { Columns, LineChart, SERIES, StatTile, WDL_LEGEND, WdlBars, Legend } from "@/ui/charts/charts";
import { RESULT_COLORS } from "@/ui/palette";

const TC_ORDER = ["bullet", "blitz", "rapid", "daily"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function OverviewTab({ stats, games, onOpen }: { stats: Stats; games: GameSummary[]; onOpen: (g: GameSummary) => void }) {
  const s = stats;
  const ratingSeries = TC_ORDER.filter((tc) => s.ratings[tc]?.length).map((tc) => ({
    name: cap(tc),
    color: SERIES[TC_ORDER.indexOf(tc)],
    points: s.ratings[tc].map((p) => ({ x: p.t, y: p.rating })),
  }));
  const byId = new Map(games.map((g) => [g.id, g]));
  const accSeries = s.engine
    ? [{ name: "Accuracy", color: SERIES[0], points: s.engine.accuracyTrend.map((p) => ({ x: p.t, y: p.accuracy, id: p.id })) }]
    : [];

  const howRows = (map: Record<string, number>) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: HOW_LABEL[k] ?? k, value: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Games" value={s.games} sub={`${s.wdl.win} W · ${s.wdl.draw} D · ${s.wdl.loss} L`} />
        <StatTile label="Score" value={`${scorePct(s.wdl).toFixed(0)}%`} sub="win = 1, draw = ½" />
        <StatTile
          label="Current streak"
          value={s.currentStreak ? `${s.currentStreak.length} ${s.currentStreak.outcome === "win" ? "W" : s.currentStreak.outcome === "loss" ? "L" : "D"}` : "—"}
          sub={`Longest win streak: ${s.longestWinStreak}`}
          accent={s.currentStreak ? RESULT_COLORS[s.currentStreak.outcome] : undefined}
        />
        <StatTile label="Engine accuracy" value={s.engine ? `${s.engine.accuracy.toFixed(1)}%` : "—"} sub={s.engine ? `${s.engine.analyzed} games analyzed` : "Run the engine analysis"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1">Rating</h2>
          <p className="mb-2 text-xs muted">After each game, per time control.</p>
          <LineChart series={ratingSeries} height={230} />
        </div>
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2>Results</h2>
            <Legend items={WDL_LEGEND} />
          </div>
          <WdlBars
            rows={[
              { key: "w", label: "As White", wdl: s.byColor.w },
              { key: "b", label: "As Black", wdl: s.byColor.b },
            ]}
          />
          <WdlBars rows={TC_ORDER.filter((tc) => s.byTimeClass[tc]).map((tc) => ({ key: tc, label: cap(tc), wdl: s.byTimeClass[tc] }))} />
          <div>
            <p className="mb-1 text-xs font-semibold muted">Opponent rating vs yours</p>
            <WdlBars rows={s.byRatingDiff.filter((d) => total(d.wdl) > 0).map((d) => ({ key: d.label, label: d.label, wdl: d.wdl }))} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2">How games end</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <HowList title="Your wins" rows={howRows(s.winsBy)} color={RESULT_COLORS.win} />
            <HowList title="Your losses" rows={howRows(s.lossesBy)} color={RESULT_COLORS.loss} />
          </div>
          <p className="mt-3 text-xs muted">
            Average length: wins {s.avgLength.win.toFixed(0)} moves · losses {s.avgLength.loss.toFixed(0)} moves
          </p>
        </div>
        <div className="card">
          <h2 className="mb-1">When you play</h2>
          <p className="mb-2 text-xs muted">Score by hour of day (bar height = score %, hover for games).</p>
          <Columns
            labelEvery={3}
            data={s.byHour.map((w, h) => ({
              label: `${h}h`,
              value: total(w) ? scorePct(w) : 0,
              tip: (
                <div>
                  {total(w)} games · score {total(w) ? scorePct(w).toFixed(0) : 0}%
                </div>
              ),
            }))}
          />
          <Columns
            height={110}
            color={SERIES[1]}
            data={s.byWeekday.map((w, d) => ({ label: WEEKDAYS[d], value: total(w) ? scorePct(w) : 0, tip: <div>{total(w)} games · score {total(w) ? scorePct(w).toFixed(0) : 0}%</div> }))}
          />
        </div>
      </div>

      {s.engine && (
        <div className="card">
          <h2 className="mb-1">Accuracy over time</h2>
          <p className="mb-2 text-xs muted">Each analyzed game. Click a point to open the game.</p>
          <LineChart series={accSeries} height={200} yDomain={[0, 100]} onPointClick={(id) => byId.get(id) && onOpen(byId.get(id)!)} />
        </div>
      )}

      {s.bestWins.length > 0 && (
        <div className="card">
          <h2 className="mb-2">Best wins</h2>
          <div className="divide-y divide-border">
            {s.bestWins.map((g) => (
              <button key={g.id} onClick={() => onOpen(g)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-surface-hover">
                <span className="badge">{g.opponentRating}</span>
                <span className="font-semibold">{g.opponent}</span>
                <span className="truncate muted">{g.opening}</span>
                <span className="ml-auto text-xs muted">{new Date(g.endTime * 1000).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HowList({ title, rows, color }: { title: string; rows: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <p className="mb-1 text-xs font-semibold muted">{title}</p>
      {rows.length === 0 && <p className="text-sm muted">None yet.</p>}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-sm">
            <span className="truncate text-text-secondary">{r.label}</span>
            <div className="h-3 rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
            <span className="text-right text-xs tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
