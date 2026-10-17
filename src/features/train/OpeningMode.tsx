import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { GameSummary } from "@/core/chesscom/api";
import { sanMovesOf } from "@/core/analysis/stats";
import { loadOpenings, type Opening } from "@/core/chess/openings";
import { isPromotion, legalDests } from "@/core/chess/game";
import { sanLine } from "@/core/chess/pgn";
import { Board, type Arrow } from "@/ui/board/Board";
import { Icon } from "@/ui/icons";
import { ARROW } from "@/ui/palette";
import { playMoveSound, sounds } from "@/ui/sound";
import { TrainShell, type Feedback } from "./shared";
import { useTrain } from "./trainStore";

interface Line {
  id: string;
  name: string;
  moves: string[];
  color: "w" | "b";
  games?: number;
}

/** The player's most played sequences (first 10 plies) for a colour. */
function repertoireLines(games: GameSummary[], color: "w" | "b"): Line[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    if (g.color !== color) continue;
    const key = sanMovesOf(g.pgn).slice(0, 10).join(" ");
    if (key.split(" ").length === 10) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, n]) => ({ id: `rep-${color}-${key}`, name: sanLine(key.split(" ")), moves: key.split(" "), color, games: n }));
}

export function OpeningMode({ games, onBack }: { games: GameSummary[]; onBack: () => void }) {
  const [color, setColor] = useState<"w" | "b">("w");
  const [line, setLine] = useState<Line | null>(null);
  const [query, setQuery] = useState("");
  const [book, setBook] = useState<Opening[]>([]);
  useEffect(() => {
    void loadOpenings().then((b) => setBook(b.all));
  }, []);
  const mine = useMemo(() => repertoireLines(games, color), [games, color]);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return book.filter((o) => o.name.toLowerCase().includes(q) || o.eco.toLowerCase() === q).slice(0, 12);
  }, [book, query]);

  if (line) return <OpeningDrill line={line} onBack={() => setLine(null)} />;

  return (
    <TrainShell
      title="Opening trainer"
      onBack={onBack}
      feedback={{ text: "Pick a line: one you play often, or any opening from the library. Then play your side's moves from memory.", mood: "talking" }}
      board={<Board fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" orientation={color} />}
    >
      <div className="card space-y-3 p-3">
        <div className="flex gap-2">
          {(["w", "b"] as const).map((c) => (
            <button key={c} className={color === c ? "chip-active" : "chip"} onClick={() => setColor(c)}>
              Play as {c === "w" ? "White" : "Black"}
            </button>
          ))}
        </div>
        <div>
          <span className="label">Your lines</span>
          {mine.length === 0 && <p className="text-sm muted">Load your chess.com games (Analyze) to train your own repertoire.</p>}
          <div className="grid gap-1">
            {mine.map((l) => (
              <button key={l.id} className="rounded-control px-2 py-1.5 text-left text-xs hover:bg-surface-hover" onClick={() => setLine(l)}>
                <span className="font-mono">{l.name}</span> <span className="badge ml-1">{l.games} games</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Opening library</span>
          <input className="input" placeholder="Search: Sicilian, Italian, B90…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="mt-1 grid max-h-64 gap-1 overflow-y-auto">
            {found.map((o) => (
              <button key={o.eco + o.name + o.moves} className="rounded-control px-2 py-1.5 text-left text-xs hover:bg-surface-hover" onClick={() => setLine({ id: `book-${color}-${o.moves}`, name: `${o.eco} ${o.name}`, moves: o.moves.split(" "), color })}>
                <div className="font-semibold">
                  {o.eco} · {o.name}
                </div>
                <div className="font-mono muted">{sanLine(o.moves.split(" "))}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </TrainShell>
  );
}

function OpeningDrill({ line, onBack }: { line: Line; onBack: () => void }) {
  const record = useTrain((s) => s.record);
  const [ply, setPly] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>({ text: `${line.name}. Play ${line.color === "w" ? "White" : "Black"}'s moves.`, mood: "talking" });
  const [wrong, setWrong] = useState<string | null>(null);
  const fens = useMemo(() => {
    const c = new Chess();
    const out = [c.fen()];
    const moves: { from: string; to: string }[] = [];
    for (const san of line.moves) {
      const m = c.move(san);
      moves.push({ from: m.from, to: m.to });
      out.push(c.fen());
    }
    return { fens: out, moves };
  }, [line]);
  const done = ply >= line.moves.length;
  const myTurn = !done && (ply % 2 === 0) === (line.color === "w");

  // The other side's moves are played automatically.
  useEffect(() => {
    if (done || myTurn) return;
    const t = setTimeout(() => {
      playMoveSound(line.moves[ply]);
      setPly((p) => p + 1);
    }, 450);
    return () => clearTimeout(t);
  }, [ply, myTurn, done, line]);

  useEffect(() => {
    if (!done) return;
    record(line.id, errors === 0, 10);
    sounds.success();
    setFeedback(errors === 0 ? { text: "Flawless! You know this line by heart.", mood: "happy", tone: "good" } : { text: `Line complete with ${errors} slip${errors > 1 ? "s" : ""}. Again?`, mood: "idle", tone: "info" });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const fen = fens.fens[ply];
  const onMove = (from: string, to: string, promo?: string) => {
    const expected = fens.moves[ply];
    if (expected.from === from && expected.to === to) {
      playMoveSound(line.moves[ply]);
      setPly((p) => p + 1);
      setWrong(null);
      setFeedback({ text: "Correct!", mood: "happy", tone: "good" });
    } else {
      void promo;
      setErrors((e) => e + 1);
      setWrong(from + to);
      sounds.fail();
      setFeedback({ text: `Not the book move. It was ${line.moves[ply]} (shown in green).`, mood: "surprised", tone: "bad" });
    }
  };
  const arrows: Arrow[] = wrong ? [{ from: fens.moves[ply].from, to: fens.moves[ply].to, color: ARROW.best }, { from: wrong.slice(0, 2), to: wrong.slice(2, 4), color: ARROW.bad }] : [];
  const last = ply > 0 ? ([fens.moves[ply - 1].from, fens.moves[ply - 1].to] as [string, string]) : null;

  return (
    <TrainShell
      title="Opening trainer"
      subtitle={line.name}
      onBack={onBack}
      progress={`${Math.min(ply, line.moves.length)}/${line.moves.length}`}
      feedback={feedback}
      board={<Board fen={fen} orientation={line.color} dests={myTurn ? legalDests(fen) : new Map()} onMove={onMove} needsPromotion={(f, t) => isPromotion(fen, f, t)} arrows={arrows} lastMove={last} />}
    >
      <div className="card grid gap-2 p-3">
        <p className="font-mono text-xs">{sanLine(line.moves.slice(0, ply)) || "—"}</p>
        <button
          className="btn"
          onClick={() => {
            setPly(0);
            setErrors(0);
            setWrong(null);
            setFeedback({ text: "From the top!", mood: "talking" });
          }}
        >
          <Icon name="refresh" /> Restart line
        </button>
      </div>
    </TrainShell>
  );
}
