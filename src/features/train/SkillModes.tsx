import { useEffect, useMemo, useRef, useState } from "react";
import { evalAnswer, hangingPieces, type EvalAnswer, type Puzzle } from "@/core/exercises/generate";
import { formatScore } from "@/core/engine/uci";
import { Board, type Arrow } from "@/ui/board/Board";
import { Icon } from "@/ui/icons";
import { ARROW } from "@/ui/palette";
import { sounds } from "@/ui/sound";
import { pvToSan } from "@/features/review/useLiveEval";
import { TrainShell, turnText, type Feedback } from "./shared";
import { prioritize, useTrain } from "./trainStore";

const BLUE = "#2a78d6cc";
const ORANGE = "#eb6834cc";

/** Two candidate moves (the best one and the game's mistake): which is better? */
export function CompareMode({ puzzles, onBack }: { puzzles: Puzzle[]; onBack: () => void }) {
  const { results, record } = useTrain();
  const queue = useMemo(() => prioritize(puzzles, results), [puzzles]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<"A" | "B" | null>(null);
  const p = queue[i];
  const flip = useMemo(() => Math.random() < 0.5, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <Empty onBack={onBack} title="Which move is better?" />;
  const moves = flip ? [p.played!, p.solution[0]] : [p.solution[0], p.played!];
  const correct: "A" | "B" = moves[0] === p.solution[0] ? "A" : "B";
  const san = (u: string) => pvToSan(p.fen, [u])[0] ?? u;
  const arrows: Arrow[] = [
    { from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), color: BLUE },
    { from: moves[1].slice(0, 2), to: moves[1].slice(2, 4), color: ORANGE },
  ];
  const choose = (c: "A" | "B") => {
    setAnswer(c);
    const ok = c === correct;
    record(p.id, ok, 5);
    (ok ? sounds.success : sounds.fail)();
  };
  const feedback: Feedback = !answer
    ? { text: `${turnText(p.color)} to move. Blue arrow (A) or orange arrow (B): which move is better?`, mood: "talking" }
    : answer === correct
      ? { text: `Right! ${san(p.solution[0])} (${formatScore(p.score)}) is better than ${san(p.played!)} (${formatScore(p.playedScore)}).`, mood: "happy", tone: "good" }
      : { text: `No — ${san(p.played!)} drops to ${formatScore(p.playedScore)}. ${san(p.solution[0])} keeps ${formatScore(p.score)}. That's the move you played in the game!`, mood: "sad", tone: "bad" };
  return (
    <TrainShell title="Which move is better?" onBack={onBack} progress={`${i + 1}/${queue.length}`} feedback={feedback} board={<Board fen={p.fen} orientation={p.color} arrows={arrows} drawable={false} />}>
      <div className="card grid grid-cols-2 gap-2 p-3">
        <button className="btn py-3" disabled={!!answer} onClick={() => choose("A")} style={{ borderColor: BLUE }}>
          <span className="h-3 w-3 rounded-full" style={{ background: BLUE }} /> A · {answer ? san(moves[0]) : "?"}
        </button>
        <button className="btn py-3" disabled={!!answer} onClick={() => choose("B")} style={{ borderColor: ORANGE }}>
          <span className="h-3 w-3 rounded-full" style={{ background: ORANGE }} /> B · {answer ? san(moves[1]) : "?"}
        </button>
        {answer && (
          <button
            className="btn-primary col-span-2"
            onClick={() => {
              setAnswer(null);
              setI((x) => (x + 1) % queue.length);
            }}
          >
            Next <Icon name="forward" />
          </button>
        )}
      </div>
    </TrainShell>
  );
}

/** Who is better? White, equal, or Black. Trains positional judgement. */
export function EvaluateMode({ puzzles, onBack }: { puzzles: Puzzle[]; onBack: () => void }) {
  const { results, record } = useTrain();
  const queue = useMemo(() => prioritize(puzzles, results), [puzzles]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<EvalAnswer | null>(null);
  const p = queue[i];
  if (!p) return <Empty onBack={onBack} title="Evaluate the position" />;
  const truth = evalAnswer(p.score);
  const label = { w: "White is better", "=": "About equal", b: "Black is better" };
  const choose = (a: EvalAnswer) => {
    setAnswer(a);
    record(p.id, a === truth, 5);
    (a === truth ? sounds.success : sounds.fail)();
  };
  const best = p.solution[0];
  return (
    <TrainShell
      title="Evaluate the position"
      onBack={onBack}
      progress={`${i + 1}/${queue.length}`}
      feedback={
        !answer
          ? { text: `${turnText(p.fen.split(" ")[1] as "w" | "b")} to move. Count material, look at king safety and activity. Who is better?`, mood: "thinking" }
          : answer === truth
            ? { text: `Yes! The engine says ${formatScore(p.score)}.`, mood: "happy", tone: "good" }
            : { text: `The engine says ${formatScore(p.score)}: ${label[truth].toLowerCase()}.`, mood: "surprised", tone: "bad" }
      }
      board={<Board fen={p.fen} orientation={p.color} arrows={answer && best ? [{ from: best.slice(0, 2), to: best.slice(2, 4), color: ARROW.best }] : []} />}
    >
      <div className="card grid gap-2 p-3">
        {(["w", "=", "b"] as EvalAnswer[]).map((a) => (
          <button key={a} className={answer === a ? (a === truth ? "btn-primary" : "btn-danger") : answer && a === truth ? "btn-primary" : "btn"} disabled={!!answer} onClick={() => choose(a)}>
            {label[a]}
          </button>
        ))}
        {answer && (
          <>
            {best && <p className="text-sm muted">Best move: {pvToSan(p.fen, [best])[0]}</p>}
            <button
              className="btn-primary"
              onClick={() => {
                setAnswer(null);
                setI((x) => (x + 1) % queue.length);
              }}
            >
              Next <Icon name="forward" />
            </button>
          </>
        )}
      </div>
    </TrainShell>
  );
}

/** Tap every piece that can be taken for free (both colours). */
export function HangingMode({ fens, onBack }: { fens: string[]; onBack: () => void }) {
  const { record } = useTrain();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const fen = fens[i % Math.max(1, fens.length)];
  const truth = useMemo(() => (fen ? hangingPieces(fen) : []), [fen]);
  if (!fen) return <Empty onBack={onBack} title="Hanging pieces" />;
  const check = () => {
    setChecked(true);
    const ok = truth.length === picked.length && truth.every((s) => picked.includes(s));
    record(`hang:${fen}`, ok, 8);
    (ok ? sounds.success : sounds.fail)();
  };
  const marks: Record<string, string> = {};
  for (const s of picked) marks[s] = checked ? (truth.includes(s) ? "#2e9d4a99" : "#c8463d99") : "#2a78d688";
  if (checked) for (const s of truth) if (!picked.includes(s)) marks[s] = "#eda10099";
  const ok = checked && truth.length === picked.length && truth.every((s) => picked.includes(s));
  return (
    <TrainShell
      title="Hanging pieces"
      onBack={onBack}
      progress={`${(i % fens.length) + 1}/${fens.length}`}
      feedback={
        !checked
          ? { text: "Tap every piece (White or Black) that can be captured for free: undefended, or attacked by a cheaper piece. Then press Check.", mood: "talking" }
          : ok
            ? { text: truth.length ? "Perfect vision!" : "Correct — nothing hangs here.", mood: "happy", tone: "good" }
            : { text: `Not quite. Green = right, red = wrong, yellow = missed (${truth.length} in total).`, mood: "sad", tone: "bad" }
      }
      board={
        <Board
          fen={fen}
          drawable={false}
          marks={marks}
          onSquareClick={(sq) => {
            if (checked) return;
            setPicked((p) => (p.includes(sq) ? p.filter((x) => x !== sq) : [...p, sq]));
          }}
        />
      }
    >
      <div className="card grid gap-2 p-3">
        {!checked ? (
          <button className="btn-primary" onClick={check}>
            <Icon name="check" /> Check ({picked.length} selected)
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={() => {
              setPicked([]);
              setChecked(false);
              setI((x) => x + 1);
            }}
          >
            Next position <Icon name="forward" />
          </button>
        )}
      </div>
    </TrainShell>
  );
}

const FILES = "abcdefgh";
const randomSquare = () => FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8));

/** 30 seconds: click the named square. */
export function CoordsMode({ onBack }: { onBack: () => void }) {
  const { best, setBest } = useTrain();
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [target, setTarget] = useState(randomSquare);
  const [score, setScore] = useState(0);
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<Record<string, string>>({});
  const scoreRef = useRef(0);
  scoreRef.current = score;
  const running = end !== null && now < end;

  useEffect(() => {
    if (end === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) {
        clearInterval(id);
        setBest(`coords-${orientation}`, scoreRef.current);
        sounds.end();
      }
    }, 100);
    return () => clearInterval(id);
  }, [end, orientation, setBest]);

  const left = end ? Math.max(0, (end - now) / 1000) : 30;
  const key = `coords-${orientation}`;
  return (
    <TrainShell
      title="Coordinates"
      onBack={onBack}
      feedback={
        running
          ? { text: `Click ${target.toUpperCase()}!`, mood: "talking" }
          : end
            ? { text: `Time! ${score} squares. Best: ${Math.max(best[key] ?? 0, score)}.`, mood: score >= (best[key] ?? 0) ? "happy" : "idle", tone: "good" }
            : { text: "Find as many squares as you can in 30 seconds. Knowing coordinates makes reading and calculating faster.", mood: "talking" }
      }
      board={
        <div className="relative">
          <Board
            fen="8/8/8/8/8/8/8/8 w - - 0 1"
            orientation={orientation}
            marks={flash}
            drawable={false}
            onSquareClick={(sq) => {
              if (!running) return;
              if (sq === target) {
                setScore((s) => s + 1);
                setFlash({ [sq]: "#2e9d4a99" });
              } else setFlash({ [sq]: "#c8463d99" });
              setTarget(randomSquare());
            }}
          />
          {running && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-card bg-black/45 px-6 py-2 text-6xl font-extrabold text-white">{target}</span>
            </div>
          )}
        </div>
      }
    >
      <div className="card grid gap-3 p-3">
        <div className="flex justify-between text-2xl font-bold tabular-nums">
          <span>{score}</span>
          <span className="muted">{left.toFixed(1)}s</span>
        </div>
        <div className="flex gap-2">
          {(["w", "b"] as const).map((c) => (
            <button key={c} disabled={running} className={orientation === c ? "chip-active" : "chip"} onClick={() => setOrientation(c)}>
              {c === "w" ? "White side" : "Black side"} · best {best[`coords-${c}`] ?? 0}
            </button>
          ))}
        </div>
        <button
          className="btn-primary"
          disabled={running}
          onClick={() => {
            setScore(0);
            setTarget(randomSquare());
            setFlash({});
            const t = Date.now();
            setNow(t);
            setEnd(t + 30_000);
          }}
        >
          <Icon name="play" /> {end ? "Again" : "Start"}
        </button>
      </div>
    </TrainShell>
  );
}

function Empty({ onBack, title }: { onBack: () => void; title: string }) {
  return <TrainShell title={title} onBack={onBack} board={<Board fen="8/8/8/8/8/8/8/8 w - - 0 1" />} feedback={{ text: "No exercises yet: analyze some games first.", mood: "thinking" }} />;
}
