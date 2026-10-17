import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { sharedEngine } from "@/core/engine/engine";
import { chooseMove, type Persona } from "@/core/ai/personas";
import { currentFen, sideToMove, type GameState } from "@/core/chess/game";
import type { Color } from "@/core/chess/rules";
import { scoreToCp, type Score } from "@/core/engine/uci";

/**
 * Plays the persona's moves when it is its turn. Also reports the engine's view of the
 * position (White's point of view), which the mascot uses to react to the player's moves.
 */
export function usePersonaMove(game: GameState | null, aiColor: Color | null, persona: Persona, onMove: (uci: string) => void) {
  const [thinking, setThinking] = useState(false);
  const [score, setScore] = useState<Score | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const fen = game ? currentFen(game) : null;
  const myTurn = !!game && !game.result && aiColor !== null && sideToMove(game) === aiColor;

  useEffect(() => {
    if (!myTurn || !fen) return;
    let cancelled = false;
    setThinking(true);
    const engine = sharedEngine();
    const started = Date.now();
    const job = engine.analyse(fen, { depth: persona.depth, multipv: persona.multipv, skill: persona.skill }, true);
    job.promise
      .then(async (analysis) => {
        if (cancelled) return;
        if (analysis.lines[0]) setScore(analysis.lines[0].score);
        const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.lan);
        const move = chooseMove(persona, analysis, legal, Math.floor(Math.random() * 1e9));
        const [min, max] = persona.thinkMs;
        const wait = min + Math.random() * (max - min) - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (!cancelled && move) onMoveRef.current(move);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setThinking(false);
      });
    return () => {
      cancelled = true;
      job.cancel();
      setThinking(false);
    };
  }, [myTurn, fen, persona]);

  return { thinking, score, scoreCp: score ? scoreToCp(score) : null };
}
