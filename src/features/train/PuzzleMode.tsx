import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { Puzzle } from "@/core/exercises/generate";
import { isPromotion, legalDests } from "@/core/chess/game";
import { sharedEngine } from "@/core/engine/engine";
import { wpFor } from "@/core/analysis/classify";
import { formatScore } from "@/core/engine/uci";
import { Board, type Arrow } from "@/ui/board/Board";
import { Icon } from "@/ui/icons";
import { ARROW } from "@/ui/palette";
import { playMoveSound, sounds } from "@/ui/sound";
import { pvToSan } from "@/features/review/useLiveEval";
import { useReview } from "@/store/review";
import { useNavigate } from "react-router-dom";
import { useAnalysis } from "@/features/analyze/analysisStore";
import { TrainShell, turnText, type Feedback } from "./shared";
import { prioritize, useTrain } from "./trainStore";

const INTRO: Record<string, (p: Puzzle) => string> = {
  fix: (p) => `In this game you played ${san(p.fen, p.played)}. ${turnText(p.color)} to move: find the better move.`,
  punish: (p) => `Your opponent just made a mistake. ${turnText(p.color)} to move: punish it!`,
  mate: (p) => `${turnText(p.color)} to move and mate in ${Math.ceil(p.solution.length / 2)}.`,
};

function san(fen: string, uci?: string) {
  return uci ? pvToSan(fen, [uci])[0] ?? uci : "";
}

function apply(fen: string, uci: string) {
  const c = new Chess(fen);
  c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return c.fen();
}

/** "Find the move" exercises (fix your mistake, punish, mate in N), checked by the engine. */
export function PuzzleMode({ puzzles, title, onBack }: { puzzles: Puzzle[]; title: string; onBack: () => void }) {
  const { results, record } = useTrain();
  const queue = useMemo(() => prioritize(puzzles, results), [puzzles]); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0);
  const p = queue[index];
  const [fen, setFen] = useState(p?.fen ?? "");
  const [step, setStep] = useState(0);
  const [state, setState] = useState<"play" | "checking" | "solved" | "failed">("play");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState(0);
  const [last, setLast] = useState<[string, string] | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const openReview = useReview((s) => s.open);
  const navigate = useNavigate();
  const games = useAnalysis((s) => s.games);

  useEffect(() => {
    if (!p) return;
    setFen(p.fen);
    setStep(0);
    setState("play");
    setHint(0);
    setLast(null);
    setMistakes(0);
    setFeedback({ text: INTRO[p.kind](p), mood: "talking", tone: "info" });
  }, [p]);

  if (!p)
    return (
      <TrainShell title={title} onBack={onBack} board={<Board fen="8/8/8/8/8/8/8/8 w - - 0 1" />} feedback={{ text: "No exercises here yet. Analyze more games!", mood: "thinking" }} />
    );

  const finish = (ok: boolean) => {
    setState(ok ? "solved" : "failed");
    if (mistakes === 0 || !ok) record(p.id, ok, p.kind === "mate" ? 15 : 10);
    (ok ? sounds.success : sounds.fail)();
  };

  const onMove = async (from: string, to: string, promo?: string) => {
    if (state !== "play") return;
    const uci = from + to + (promo ?? "");
    const expected = p.solution[step];
    const next = apply(fen, uci);
    playMoveSound(san(fen, uci));
    setLast([from, to]);
    if (uci === expected || (expected && uci === expected.slice(0, 4) && expected.length === 5 && promo === "q")) {
      return advance(next);
    }
    // Not the stored move: for single-move exercises the engine decides if it is just as good.
    if (p.kind !== "mate" && step === 0) {
      setFen(next);
      setState("checking");
      setFeedback({ text: "Hmm, let me check that move…", mood: "thinking" });
      try {
        const a = await sharedEngine().analyse(next, { depth: 14 }, true).promise;
        const score = a.lines[0]?.score ?? { cp: 0 };
        const loss = wpFor(p.score, p.color) - wpFor(score, p.color);
        if (loss < 4) {
          setFeedback({ text: `Also good! ${formatScore(score)}. The engine's first choice was ${san(p.fen, p.solution[0])}.`, mood: "happy", tone: "good" });
          finish(mistakes === 0);
          return;
        }
        setFeedback({ text: `Not quite (${formatScore(score)}). Try again!`, mood: "sad", tone: "bad" });
      } catch {
        /* interrupted */
      }
    } else {
      setFeedback({ text: "That's not it. Try again!", mood: "sad", tone: "bad" });
    }
    setMistakes((m) => m + 1);
    sounds.fail();
    setTimeout(() => {
      setFen(fen);
      setLast(null);
      setState("play");
    }, 700);
  };

  const advance = (afterMine: string) => {
    const nextStep = step + 1;
    if (nextStep >= p.solution.length) {
      setFen(afterMine);
      setFeedback({ text: mistakes ? "Solved! Next time on the first try 😉" : pick(["Excellent!", "That's it!", "Hoo-hoo! Perfect.", "Exactly right!"]), mood: "happy", tone: "good" });
      finish(mistakes === 0);
      return;
    }
    // Opponent's reply from the solution line.
    setFen(afterMine);
    const reply = p.solution[nextStep];
    setTimeout(() => {
      const afterReply = apply(afterMine, reply);
      playMoveSound(san(afterMine, reply));
      setFen(afterReply);
      setLast([reply.slice(0, 2), reply.slice(2, 4)]);
      setStep(nextStep + 1);
      setFeedback({ text: "Good! Keep going…", mood: "happy", tone: "info" });
    }, 450);
    setStep(nextStep);
  };

  const showSolution = () => {
    record(p.id, false);
    setState("failed");
    setFen(p.fen);
    setLast(null);
    setFeedback({ text: `The solution: ${pvToSan(p.fen, p.solution).join(" ")}`, mood: "talking", tone: "info" });
  };

  const arrows: Arrow[] = [];
  const target = p.solution[step];
  if (state === "play" && hint >= 2 && target) arrows.push({ from: target.slice(0, 2), to: target.slice(2, 4), color: ARROW.hint });
  if (state === "failed" || state === "solved") {
    if (p.solution[0]) arrows.push({ from: p.solution[0].slice(0, 2), to: p.solution[0].slice(2, 4), color: ARROW.best });
    if (p.played && fen === p.fen) arrows.push({ from: p.played.slice(0, 2), to: p.played.slice(2, 4), color: ARROW.bad });
  }
  const marks = state === "play" && hint === 1 && target ? { [target.slice(0, 2)]: "#7b3fbf66" } : undefined;
  const game = games.find((g) => g.id === p.gameId);

  return (
    <TrainShell
      title={title}
      subtitle={`vs ${p.opponent} · ${new Date(p.date).toLocaleDateString()} · move ${Math.ceil(p.ply / 2)}`}
      onBack={onBack}
      progress={`${index + 1}/${queue.length}`}
      feedback={feedback}
      board={
        <Board
          fen={fen}
          orientation={p.color}
          dests={state === "play" ? legalDests(fen) : new Map()}
          onMove={onMove}
          needsPromotion={(f, t) => isPromotion(fen, f, t)}
          lastMove={last}
          arrows={arrows}
          marks={marks}
        />
      }
    >
      <div className="card grid gap-2 p-3">
        {state === "play" || state === "checking" ? (
          <>
            <button className="btn" onClick={() => setHint((h) => Math.min(2, h + 1))} disabled={hint >= 2}>
              <Icon name="bulb" /> {hint === 0 ? "Hint: which piece?" : hint === 1 ? "Show the move" : "Hint shown"}
            </button>
            <button className="btn" onClick={showSolution}>
              <Icon name="eye" /> Show solution
            </button>
          </>
        ) : (
          <>
            <p className="text-sm">
              Best: <b>{pvToSan(p.fen, p.solution).join(" ")}</b> ({formatScore(p.score)})
              {p.played && (
                <>
                  <br />
                  In the game: <b>{san(p.fen, p.played)}</b> ({formatScore(p.playedScore)})
                </>
              )}
            </p>
            <button className="btn-primary" onClick={() => setIndex((i) => (i + 1) % queue.length)}>
              Next exercise <Icon name="forward" />
            </button>
            {game && (
              <button
                className="btn"
                onClick={() => {
                  openReview({ id: game.id, pgn: game.pgn, white: game.color === "w" ? "You" : game.opponent, black: game.color === "b" ? "You" : game.opponent, orientation: game.color, ply: p.ply - 1 });
                  navigate("/review");
                }}
              >
                <Icon name="chart" /> See it in the game
              </button>
            )}
          </>
        )}
      </div>
    </TrainShell>
  );
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
