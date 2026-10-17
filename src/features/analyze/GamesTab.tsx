import { useState } from "react";
import type { GameSummary } from "@/core/chesscom/api";
import { HOW_LABEL } from "@/core/chesscom/api";
import { RESULT_COLORS, CLASS_STYLE } from "@/ui/palette";
import { Icon } from "@/ui/icons";
import { useAnalysis } from "./analysisStore";

export function GamesTab({ games, onOpen }: { games: GameSummary[]; onOpen: (g: GameSummary) => void }) {
  const { analyses, analyze, queue } = useAnalysis();
  const [shown, setShown] = useState(40);
  const [query, setQuery] = useState("");
  const list = games.filter((g) => !query || g.opponent.toLowerCase().includes(query.toLowerCase()) || g.opening.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-2">
      <input className="input max-w-sm" placeholder="Filter by opponent or opening" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="card divide-y divide-border p-0">
        {list.slice(0, shown).map((g) => {
          const a = analyses.get(g.id);
          const acc = a ? a.accuracy[g.color] : g.ccAccuracy;
          const counts = a?.counts[g.color];
          return (
            <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm hover:bg-surface-hover">
              <span className="w-12 rounded-pill py-0.5 text-center text-xs font-bold text-white" style={{ background: RESULT_COLORS[g.outcome] }}>
                {g.outcome === "win" ? "Win" : g.outcome === "loss" ? "Loss" : "Draw"}
              </span>
              <span className={`h-3 w-3 rounded-full ring-1 ${g.color === "w" ? "bg-white ring-black/40" : "bg-black ring-white/40"}`} title={g.color === "w" ? "White" : "Black"} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {g.opponent} <span className="font-normal muted">({g.opponentRating})</span>
                </div>
                <div className="truncate text-xs muted">
                  {g.opening} · {HOW_LABEL[g.how] ?? g.how} · {Math.ceil(g.plies / 2)} moves
                </div>
              </div>
              <div className="flex items-center gap-2">
                {counts && (
                  <span className="hidden gap-1 text-xs sm:flex">
                    {(["blunder", "mistake", "inaccuracy"] as const).map((c) =>
                      counts[c] ? (
                        <span key={c} className="rounded px-1 font-bold text-white" style={{ background: CLASS_STYLE[c].color }} title={CLASS_STYLE[c].label}>
                          {counts[c]}
                          {CLASS_STYLE[c].symbol}
                        </span>
                      ) : null
                    )}
                  </span>
                )}
                {acc !== undefined && (
                  <span className="badge tabular-nums" title={a ? "Engine accuracy (Chess Lab)" : "chess.com accuracy"}>
                    {acc.toFixed(1)}%
                  </span>
                )}
                <span className="w-16 text-right text-xs muted">
                  {g.timeClass}
                  <br />
                  {new Date(g.endTime * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
                {!a && (
                  <button className="btn-sm btn" disabled={queue.running} onClick={() => analyze([g.id])} title="Analyze with the engine">
                    <Icon name="chart" size={14} />
                  </button>
                )}
                <button className="btn-sm btn-primary" onClick={() => onOpen(g)}>
                  Review
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="p-4 text-sm muted">No games.</p>}
      </div>
      {shown < list.length && (
        <button className="btn w-full" onClick={() => setShown((s) => s + 40)}>
          Show more ({list.length - shown} left)
        </button>
      )}
    </div>
  );
}
