import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { buildRepertoire, scorePct, total, type RepNode, type Stats } from "@/core/analysis/stats";
import type { GameSummary } from "@/core/chesscom/api";
import { epdOf, loadOpenings, type OpeningBook } from "@/core/chess/openings";
import { WDL_LEGEND, WdlBars, Legend } from "@/ui/charts/charts";
import { MiniBoard } from "@/ui/board/MiniBoard";
import { Icon } from "@/ui/icons";

export function OpeningsTab({ stats, games }: { stats: Stats; games: GameSummary[] }) {
  const [color, setColor] = useState<"w" | "b">("w");
  const rows = stats.openings.filter((o) => o.color === color).slice(0, 15);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["w", "b"] as const).map((c) => (
          <button key={c} className={color === c ? "chip-active" : "chip"} onClick={() => setColor(c)}>
            As {c === "w" ? "White" : "Black"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2>Most played openings</h2>
            <Legend items={WDL_LEGEND} />
          </div>
          {rows.length === 0 ? (
            <p className="text-sm muted">No games with this color.</p>
          ) : (
            <WdlBars
              rows={rows.map((o) => ({
                key: o.name,
                label: o.name,
                wdl: o.wdl,
                extra: o.accuracy !== null ? <span className="ml-1 muted">· {o.accuracy.toFixed(0)}% acc</span> : undefined,
              }))}
            />
          )}
        </div>
        <Repertoire games={games} color={color} />
      </div>
    </div>
  );
}

/** Explore the player's own move tree: which moves they play and how they score after each. */
function Repertoire({ games, color }: { games: GameSummary[]; color: "w" | "b" }) {
  const root = useMemo(() => buildRepertoire(games, color), [games, color]);
  const [path, setPath] = useState<string[]>([]);
  const [book, setBook] = useState<OpeningBook | null>(null);
  useEffect(() => setPath([]), [color, games]);
  useEffect(() => {
    void loadOpenings().then(setBook);
  }, []);

  let node: RepNode = root;
  for (const san of path) node = node.children.get(san) ?? node;
  const chess = new Chess();
  const fens: string[] = [];
  let last: [string, string] | null = null;
  for (const san of path) {
    try {
      const m = chess.move(san);
      last = [m.from, m.to];
      fens.push(chess.fen());
    } catch {
      break;
    }
  }
  const name = book ? [...fens].reverse().map((f) => book.byEpd.get(epdOf(f))?.name).find(Boolean) : undefined;
  const children = [...node.children.values()].sort((a, b) => total(b.wdl) - total(a.wdl)).slice(0, 8);

  return (
    <div className="card">
      <h2 className="mb-1">Your repertoire</h2>
      <p className="mb-3 text-xs muted">Follow the moves you actually play. Bars show your results after each move.</p>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div>
          <MiniBoard fen={chess.fen()} orientation={color} highlight={last ?? []} />
          <p className="mt-2 text-xs font-semibold">{name ?? (path.length ? "" : "Starting position")}</p>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1 text-sm">
            <button className="btn-sm btn" onClick={() => setPath([])} disabled={!path.length}>
              <Icon name="first" size={14} />
            </button>
            <button className="btn-sm btn" onClick={() => setPath((p) => p.slice(0, -1))} disabled={!path.length}>
              <Icon name="back" size={14} />
            </button>
            <span className="ml-1 truncate font-mono text-xs">
              {path.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(" ") || "—"}
            </span>
          </div>
          {children.length === 0 ? (
            <p className="text-sm muted">No more games beyond this point.</p>
          ) : (
            <WdlBars
              rows={children.map((c) => ({ key: c.san, label: <span className="font-mono font-semibold text-text-primary">{c.san}</span>, wdl: c.wdl }))}
              onRowClick={(san) => setPath((p) => [...p, san])}
            />
          )}
          <p className="mt-2 text-xs muted">
            {total(node.wdl)} games reach this position · score {scorePct(node.wdl).toFixed(0)}%
          </p>
        </div>
      </div>
    </div>
  );
}
