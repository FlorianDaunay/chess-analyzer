import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { generatePuzzles, visionPositions } from "@/core/exercises/generate";
import { parsePgn } from "@/core/chess/pgn";
import { loadOpenings } from "@/core/chess/openings";
import { Chess } from "chess.js";
import { useSettings } from "@/store/settings";
import { Icon, type IconName } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";
import { useAnalysis } from "@/features/analyze/analysisStore";
import { useTrain } from "./trainStore";
import { PuzzleMode } from "./PuzzleMode";
import { CompareMode, CoordsMode, EvaluateMode, HangingMode } from "./SkillModes";
import { OpeningMode } from "./OpeningMode";
import { EndgameMode } from "./EndgameMode";

type Mode = "fix" | "punish" | "mate" | "compare" | "evaluate" | "hanging" | "coords" | "openings" | "endgames";

export default function TrainPage() {
  const { games, analyses, load, loading, user } = useAnalysis();
  const saved = useSettings((s) => s.chessComUser);
  const { xp, streak, results } = useTrain();
  const [mode, setMode] = useState<Mode | null>(null);
  const [visionFens, setVisionFens] = useState<string[]>([]);

  // Exercises come from analyzed games: load the saved account's games if needed.
  useEffect(() => {
    if (!games.length && saved && !loading && user !== saved.toLowerCase()) void load(saved, 3);
  }, [games.length, saved, loading, user, load]);

  const puzzles = useMemo(() => generatePuzzles(games, analyses), [games, analyses]);
  const byKind = (k: string) => puzzles.filter((p) => p.kind === k);

  // Board-vision positions: middlegames from the player's games, or from long opening lines.
  useEffect(() => {
    let alive = true;
    (async () => {
      const fens: string[] = [];
      for (const g of games.slice(0, 60)) {
        const parsed = parsePgn(g.pgn);
        const c = new Chess(parsed.startFen);
        parsed.ucis.forEach((u, i) => {
          c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
          if (i >= 14 && i <= 40 && i % 6 === 0) fens.push(c.fen());
        });
      }
      if (fens.length < 20) {
        const book = await loadOpenings();
        for (const o of book.all.filter((o) => o.moves.split(" ").length >= 14).slice(0, 300)) {
          const c = new Chess();
          for (const san of o.moves.split(" ")) c.move(san);
          fens.push(c.fen());
        }
      }
      if (alive) setVisionFens(visionPositions(fens, Date.now(), 30));
    })();
    return () => {
      alive = false;
    };
  }, [games]);

  const back = () => setMode(null);
  if (mode === "fix") return <PuzzleMode puzzles={byKind("fix")} title="Fix your mistakes" onBack={back} />;
  if (mode === "punish") return <PuzzleMode puzzles={byKind("punish")} title="Punish the blunder" onBack={back} />;
  if (mode === "mate") return <PuzzleMode puzzles={byKind("mate")} title="Find the mate" onBack={back} />;
  if (mode === "compare") return <CompareMode puzzles={byKind("compare")} onBack={back} />;
  if (mode === "evaluate") return <EvaluateMode puzzles={byKind("evaluate")} onBack={back} />;
  if (mode === "hanging") return <HangingMode fens={visionFens} onBack={back} />;
  if (mode === "coords") return <CoordsMode onBack={back} />;
  if (mode === "openings") return <OpeningMode games={games} onBack={back} />;
  if (mode === "endgames") return <EndgameMode onBack={back} />;

  const solvedOf = (kind: string) => byKind(kind).filter((p) => results[p.id]?.last === "solved").length;
  const fromGames: { id: Mode; icon: IconName; title: string; text: string; count: number }[] = [
    { id: "fix", icon: "undo", title: "Fix your mistakes", text: "Positions where you went wrong. Find what you should have played.", count: byKind("fix").length },
    { id: "punish", icon: "target", title: "Punish the blunder", text: "Your opponent slipped. Did you see how to take advantage?", count: byKind("punish").length },
    { id: "mate", icon: "crown", title: "Find the mate", text: "Forced mates you missed in your games.", count: byKind("mate").length },
    { id: "compare", icon: "swords", title: "Which move is better?", text: "Two candidate moves, one is your mistake. Pick the right one.", count: byKind("compare").length },
    { id: "evaluate", icon: "eye", title: "Evaluate the position", text: "White better, equal or Black better? Train your judgement.", count: byKind("evaluate").length },
  ];
  const skills: { id: Mode; icon: IconName; title: string; text: string }[] = [
    { id: "hanging", icon: "search", title: "Hanging pieces", text: "Spot every piece that can be taken for free." },
    { id: "coords", icon: "grid", title: "Coordinates", text: "30 seconds to click as many named squares as possible." },
    { id: "openings", icon: "star", title: "Opening trainer", text: "Drill your own lines or any opening from the library." },
    { id: "endgames", icon: "trophy", title: "Endgames", text: "Win (or hold) classic endgames against the engine." },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1">Train</h1>
        <span className="badge text-sm">⭐ {xp} XP</span>
        <span className="badge text-sm">🔥 streak {streak}</span>
      </div>

      {!puzzles.length && (
        <div className="card flex flex-wrap items-center gap-4">
          <Mascot size={64} mood="talking" />
          <p className="min-w-[200px] flex-1 text-sm">
            {loading
              ? "Loading your games…"
              : games.length
                ? "Your games are loaded but not analyzed yet. Run the engine analysis and your mistakes will turn into exercises here."
                : "Analyze your chess.com games first: every mistake you made becomes an exercise. The skill drills below work right away."}
          </p>
          <Link to={saved ? `/analyze?user=${encodeURIComponent(saved)}` : "/analyze"} className="btn-primary">
            <Icon name="chart" /> Go to Analyze
          </Link>
        </div>
      )}

      <section>
        <h2 className="mb-2">From your games</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fromGames.map((m) => (
            <button key={m.id} disabled={!m.count} onClick={() => setMode(m.id)} className="card flex gap-3 text-left transition-all enabled:hover:-translate-y-0.5 disabled:opacity-50">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-accent/15 text-accent">
                <Icon name={m.icon} size={22} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{m.title}</div>
                <p className="text-sm text-text-secondary">{m.text}</p>
                <p className="mt-1 text-xs muted">
                  {m.count} exercises{m.count ? ` · ${solvedOf(m.id)} solved` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2">Skills</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {skills.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} className="card flex flex-col gap-2 text-left transition-all hover:-translate-y-0.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-tile bg-accent/15 text-accent">
                <Icon name={m.icon} size={22} />
              </div>
              <div className="font-semibold">{m.title}</div>
              <p className="text-sm text-text-secondary">{m.text}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
