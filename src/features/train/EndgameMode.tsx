import { useEffect, useState } from "react";
import { ENDGAMES, type EndgameDrill } from "@/core/exercises/generate";
import { createGame, currentFen, isPromotion, legalDests, makeMove, sideToMove, describeResult, type GameState } from "@/core/chess/game";
import { findPersona } from "@/core/ai/personas";
import { Board } from "@/ui/board/Board";
import { MiniBoard } from "@/ui/board/MiniBoard";
import { Icon } from "@/ui/icons";
import { sounds } from "@/ui/sound";
import { usePersonaMove } from "@/features/play/usePersonaMove";
import { TrainShell, type Feedback } from "./shared";
import { useTrain } from "./trainStore";

const ORACLE = { ...findPersona("oracle"), thinkMs: [300, 700] as [number, number], depth: 16 };

export function EndgameMode({ onBack }: { onBack: () => void }) {
  const [drill, setDrill] = useState<EndgameDrill | null>(null);
  const results = useTrain((s) => s.results);
  if (drill) return <Drill key={drill.id} drill={drill} onBack={() => setDrill(null)} />;
  return (
    <TrainShell title="Endgames" onBack={onBack} feedback={{ text: "Classic endgames against the full-strength engine. Win them (or hold the draw) within the move limit.", mood: "talking" }} board={<Board fen={ENDGAMES[0].fen} />}>
      <div className="grid grid-cols-2 gap-2">
        {ENDGAMES.map((d) => (
          <button key={d.id} className="card p-2 text-left hover:bg-surface-hover" onClick={() => setDrill(d)}>
            <MiniBoard fen={d.fen} orientation={d.fen.split(" ")[1] as "w" | "b"} />
            <div className="mt-1 flex items-center justify-between text-sm font-semibold">
              {d.name}
              {results[`end-${d.id}`]?.solved ? <span className="text-success">✓</span> : null}
            </div>
            <div className="text-xs muted">
              {d.goal === "win" ? "Win" : "Draw"} in {d.moves} moves
            </div>
          </button>
        ))}
      </div>
    </TrainShell>
  );
}

function Drill({ drill, onBack }: { drill: EndgameDrill; onBack: () => void }) {
  const record = useTrain((s) => s.record);
  const me = drill.fen.split(" ")[1] as "w" | "b";
  const [game, setGame] = useState<GameState>(() => createGame({ start: "fen", fen: drill.fen, clock: null, takebacks: true }));
  const [outcome, setOutcome] = useState<"won" | "lost" | null>(null);
  const ai = usePersonaMove(outcome ? null : game, me === "w" ? "b" : "w", ORACLE, (uci) => {
    setGame((g) => {
      const r = makeMove(g, uci, Date.now());
      return r.ok ? r.state : g;
    });
  });
  // The drill always starts with the player to move.
  const myMoves = Math.ceil(game.moves.length / 2);

  useEffect(() => {
    if (outcome) return;
    let result: "won" | "lost" | null = null;
    if (game.result) {
      const win = game.result.winner === me;
      const draw = game.result.winner === null;
      result = drill.goal === "win" ? (win ? "won" : "lost") : win || draw ? "won" : "lost";
    } else if (myMoves >= drill.moves) result = drill.goal === "draw" ? "won" : "lost";
    if (result) {
      setOutcome(result);
      record(`end-${drill.id}`, result === "won", 20);
      (result === "won" ? sounds.success : sounds.fail)();
    }
  }, [game, myMoves, drill, me, outcome, record]);

  const fen = currentFen(game);
  const myTurn = !outcome && !game.result && sideToMove(game) === me;
  const feedback: Feedback = outcome
    ? outcome === "won"
      ? { text: drill.goal === "win" ? `Done in ${myMoves} moves! ${game.result ? describeResult(game.result) : ""}` : "You held the draw. Well defended!", mood: "happy", tone: "good" }
      : { text: game.result ? `${describeResult(game.result)}. Try again!` : `Move limit reached (${drill.moves}). Try a more direct plan!`, mood: "sad", tone: "bad" }
    : ai.thinking
      ? { text: "The engine is thinking…", mood: "thinking" }
      : { text: `${drill.description} Moves: ${myMoves}/${drill.moves}.`, mood: "talking" };

  return (
    <TrainShell
      title={drill.name}
      subtitle={drill.goal === "win" ? "Win against the engine" : "Hold the draw against the engine"}
      onBack={onBack}
      feedback={feedback}
      board={
        <Board
          fen={fen}
          orientation={me}
          dests={myTurn ? legalDests(fen) : new Map()}
          onMove={(f, t, p) => {
            const r = makeMove(game, f + t + (p ?? ""), Date.now());
            if (r.ok) setGame(r.state);
          }}
          needsPromotion={(f, t) => isPromotion(fen, f, t)}
          lastMove={game.moves.length ? [game.moves[game.moves.length - 1].uci.slice(0, 2), game.moves[game.moves.length - 1].uci.slice(2, 4)] : null}
        />
      }
    >
      <div className="card grid gap-2 p-3">
        <button
          className="btn"
          onClick={() => {
            setGame(createGame({ start: "fen", fen: drill.fen, clock: null }));
            setOutcome(null);
          }}
        >
          <Icon name="refresh" /> Restart
        </button>
      </div>
    </TrainShell>
  );
}
