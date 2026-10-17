import { Link } from "react-router-dom";
import type { MoveRef, Stats } from "@/core/analysis/stats";
import type { GameSummary } from "@/core/chesscom/api";
import { formatScore } from "@/core/engine/uci";
import { Chess } from "chess.js";
import { Columns, Meter, SERIES, StatTile } from "@/ui/charts/charts";
import { MiniBoard } from "@/ui/board/MiniBoard";
import { ARROW, CLASS_STYLE, type MoveClass } from "@/ui/palette";
import { Mascot } from "@/ui/mascot/Mascot";

const CLASSES: MoveClass[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];

function sanOf(fen: string, uci: string | null) {
  if (!uci) return "—";
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

export function MistakesTab({ stats, onOpen }: { stats: Stats; onOpen: (g: GameSummary, ply?: number) => void }) {
  const e = stats.engine;
  if (!e)
    return (
      <div className="card flex flex-col items-center gap-3 py-10 text-center">
        <Mascot size={80} mood="thinking" />
        <p className="max-w-md text-text-secondary">Run the engine analysis (panel above) to find your best and worst moves.</p>
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Blunders per game" value={(e.perGame.blunder ?? 0).toFixed(2)} accent={CLASS_STYLE.blunder.color} />
        <StatTile label="Mistakes per game" value={(e.perGame.mistake ?? 0).toFixed(2)} accent={CLASS_STYLE.mistake.color} />
        <StatTile label="Brilliant + great" value={((e.perGame.brilliant ?? 0) + (e.perGame.great ?? 0)).toFixed(2)} sub="per game" accent={CLASS_STYLE.brilliant.color} />
        <StatTile
          label="Blunders in time trouble"
          value={e.timeTroubleBlunders.blunders ? `${Math.round((e.timeTroubleBlunders.inTimeTrouble / e.timeTroubleBlunders.blunders) * 100)}%` : "—"}
          sub="with < 10% of the clock left"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1">Your moves, per game</h2>
          <p className="mb-2 text-xs muted">Average number of moves in each category.</p>
          <Columns
            data={CLASSES.map((c) => ({ label: CLASS_STYLE[c].symbol, value: e.perGame[c] ?? 0, tip: <div>{CLASS_STYLE[c].label}: {(e.perGame[c] ?? 0).toFixed(2)} per game</div> }))}
            format={(v) => v.toFixed(2)}
          />
        </div>
        <div className="card space-y-3">
          <h2>Accuracy by phase</h2>
          {(["opening", "middlegame", "endgame"] as const).map((p) => (
            <div key={p}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="capitalize text-text-secondary">{p}</span>
                <span className="font-semibold tabular-nums">{e.phaseAccuracy[p] !== undefined ? `${e.phaseAccuracy[p]!.toFixed(1)}%` : "—"}</span>
              </div>
              <Meter value={e.phaseAccuracy[p] ?? 0} color={SERIES[0]} />
            </div>
          ))}
          <h2 className="pt-2">Accuracy by result</h2>
          <div className="flex gap-4 text-sm">
            {(["win", "draw", "loss"] as const).map((o) => (
              <span key={o}>
                <span className="capitalize muted">{o}s</span> <b className="tabular-nums">{e.accuracyByOutcome[o] !== undefined ? `${e.accuracyByOutcome[o]!.toFixed(1)}%` : "—"}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
      <MoveGallery title="Worst moves" subtitle="Biggest drops in winning chances. Red: your move · green: the best move." items={e.worstMoves} onOpen={onOpen} bad />
      <MoveGallery title="Best moves" subtitle="Brilliant and great moves you found." items={e.bestMoves} onOpen={onOpen} />
      <div className="card flex items-center gap-3">
        <Mascot size={48} mood="happy" />
        <p className="text-sm">
          Every mistake here becomes a puzzle in{" "}
          <Link to="/train" className="font-semibold text-accent">
            Train
          </Link>
          . Fix them once, and you won't repeat them!
        </p>
      </div>
    </div>
  );
}

function MoveGallery({ title, subtitle, items, onOpen, bad }: { title: string; subtitle: string; items: MoveRef[]; onOpen: (g: GameSummary, ply?: number) => void; bad?: boolean }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="mb-3 text-xs muted">{subtitle}</p>
      {items.length === 0 && <p className="text-sm muted">None found yet.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.slice(0, 15).map(({ game, move }) => {
          const arrows = [
            ...(bad ? [{ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), color: ARROW.bad }] : []),
            ...(move.best ? [{ from: move.best.slice(0, 2), to: move.best.slice(2, 4), color: ARROW.best }] : []),
          ];
          const style = CLASS_STYLE[move.cls];
          return (
            <button key={game.id + move.ply} onClick={() => onOpen(game, move.ply - 1)} className="group rounded-tile p-1.5 text-left hover:bg-surface-hover">
              <MiniBoard fen={move.fenBefore} orientation={game.color} arrows={arrows} />
              <div className="mt-1 flex items-center gap-1.5 text-sm">
                <span className="rounded px-1 text-xs font-bold text-white" style={{ background: style.color }}>
                  {style.symbol}
                </span>
                <span className="font-semibold">
                  {Math.ceil(move.ply / 2)}
                  {move.color === "w" ? "." : "..."}
                  {move.san}
                </span>
                <span className="ml-auto text-xs tabular-nums muted">
                  {formatScore(move.before)}→{formatScore(move.after)}
                </span>
              </div>
              {bad && <div className="text-xs muted">Best: {sanOf(move.fenBefore, move.best)}</div>}
              <div className="truncate text-xs muted">vs {game.opponent}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
