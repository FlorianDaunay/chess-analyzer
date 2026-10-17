import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { Board, type Arrow } from "@/ui/board/Board";
import { currentFen, describeResult, isPromotion, legalDests, remainingMs, sideToMove, type GameState } from "@/core/chess/game";
import type { Color } from "@/core/chess/rules";
import { describeRules } from "@/core/chess/rules";
import { Icon } from "@/ui/icons";
import { playMoveSound, sounds } from "@/ui/sound";
import { MoveList } from "./MoveList";
import { PlayerBar, useTicker } from "./PlayerBar";

export interface PlayerInfo {
  name: string;
  avatar?: ReactNode;
}

export interface GameViewProps {
  game: GameState;
  players: Record<Color, PlayerInfo>;
  /** Colours this device may move (both for a local game, none for a spectator). */
  myColors: Color[];
  orientation: Color;
  onFlip?: () => void;
  onMove: (uci: string) => void;
  onResign?: (color: Color) => void;
  onOfferDraw?: (color: Color) => void;
  onTakeback?: () => void;
  arrows?: Arrow[];
  /** Panel under the move list (chat, hints, opponent info…). */
  side?: ReactNode;
  /** Content of the game-over card (rematch, analyze…). */
  gameOverActions?: ReactNode;
  /** Shown above the board (status messages). */
  banner?: ReactNode;
}

function kingInCheck(fen: string): string | null {
  try {
    const chess = new Chess(fen);
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    for (const row of chess.board()) for (const p of row) if (p && p.type === "k" && p.color === turn) return p.square;
  } catch {
    /* ignore */
  }
  return null;
}

export function GameView(props: GameViewProps) {
  const { game, players, myColors, orientation, onMove, arrows, side, gameOverActions, banner } = props;
  const [view, setView] = useState<number | null>(null); // null = live
  const [showOver, setShowOver] = useState(true);
  const live = view === null || view >= game.moves.length - 1;
  const shownIndex = live ? game.moves.length - 1 : view!;
  const fen = shownIndex >= 0 ? game.moves[shownIndex].fen : game.startFen;
  const turn = sideToMove(game);
  const canMove = live && !game.result && myColors.includes(turn);
  const dests = useMemo(() => (canMove ? legalDests(currentFen(game)) : new Map<string, string[]>()), [canMove, game]);
  const running = !!game.clocks && !game.result && game.turnStartedAt !== null;
  const now = useTicker(running);
  const last = shownIndex >= 0 ? game.moves[shownIndex].uci : null;

  // Sounds for new moves and the end of the game.
  const seen = useRef(game.moves.length);
  useEffect(() => {
    if (game.moves.length > seen.current) playMoveSound(game.moves[game.moves.length - 1].san);
    seen.current = game.moves.length;
    setView(null);
  }, [game.moves]);
  const ended = useRef(!!game.result);
  useEffect(() => {
    if (game.result && !ended.current) {
      sounds.end();
      setShowOver(true);
    }
    ended.current = !!game.result;
  }, [game.result]);

  // Keyboard navigation through the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") setView((v) => Math.max(-1, (v ?? game.moves.length - 1) - 1));
      if (e.key === "ArrowRight") setView((v) => (v === null ? null : v + 1 >= game.moves.length - 1 ? null : v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game.moves.length]);

  const top: Color = orientation === "w" ? "b" : "w";
  const bottom: Color = orientation;
  const bar = (c: Color) => (
    <PlayerBar
      name={players[c].name}
      avatar={players[c].avatar}
      color={c}
      fen={fen}
      clockMs={remainingMs(game, c, now)}
      running={running && turn === c}
      active={!game.result && turn === c}
    />
  );
  const actor: Color = myColors.includes(turn) ? turn : myColors[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-300px))] lg:max-w-[calc(100dvh-190px)]">
        {banner}
        {bar(top)}
        <Board
          fen={fen}
          orientation={orientation}
          dests={dests}
          onMove={(from, to, promo) => onMove(from + to + (promo ?? ""))}
          needsPromotion={(from, to) => isPromotion(currentFen(game), from, to)}
          lastMove={last ? [last.slice(0, 2), last.slice(2, 4)] : null}
          check={kingInCheck(fen)}
          arrows={live ? arrows : []}
          overlay={
            game.result && showOver && live ? (
              <div className="flex h-full items-center justify-center bg-black/30 p-4" onPointerDown={(e) => e.stopPropagation()}>
                <div className="animate-pop card w-full max-w-xs text-center">
                  <p className="text-lg font-bold">{describeResult(game.result)}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {gameOverActions}
                    <button className="btn" onClick={() => setShowOver(false)}>
                      View board
                    </button>
                  </div>
                </div>
              </div>
            ) : undefined
          }
        />
        {bar(bottom)}
      </div>

      <div className="flex flex-col gap-3">
        <div className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide muted">{describeRules(game.rules)}</span>
            {game.rules.variant === "threeCheck" && (
              <span className="badge">
                Checks {game.checks.w}–{game.checks.b}
              </span>
            )}
          </div>
          <MoveList sans={game.moves.map((m) => m.san)} current={shownIndex} onSelect={(i) => setView(i)} startPly={game.startFen.split(" ")[1] === "b" ? 1 : 0} />
          <div className="mt-2 flex items-center justify-between gap-1 border-t border-border pt-2">
            <div className="flex gap-1">
              <button className="btn-icon btn-ghost" onClick={() => setView(-1)} aria-label="First move">
                <Icon name="first" />
              </button>
              <button className="btn-icon btn-ghost" onClick={() => setView((v) => Math.max(-1, (v ?? game.moves.length - 1) - 1))} aria-label="Previous move">
                <Icon name="back" />
              </button>
              <button className="btn-icon btn-ghost" onClick={() => setView((v) => (v === null || v + 1 >= game.moves.length - 1 ? null : v + 1))} aria-label="Next move">
                <Icon name="forward" />
              </button>
              <button className="btn-icon btn-ghost" onClick={() => setView(null)} aria-label="Last move">
                <Icon name="last" />
              </button>
            </div>
            {props.onFlip && (
              <button className="btn-icon btn-ghost" onClick={props.onFlip} aria-label="Flip board">
                <Icon name="flip" />
              </button>
            )}
          </div>
        </div>

        {!game.result && myColors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {props.onTakeback && game.rules.takebacks && (
              <button className="btn flex-1" onClick={props.onTakeback} disabled={!game.moves.length}>
                <Icon name="undo" /> Takeback
              </button>
            )}
            {props.onOfferDraw && (
              <button className="btn flex-1" onClick={() => props.onOfferDraw!(actor)}>
                <Icon name="handshake" /> {game.drawOffer && !myColors.includes(game.drawOffer) ? "Accept draw" : "Draw"}
              </button>
            )}
            {props.onResign && (
              <button
                className="btn-danger flex-1"
                onClick={() => {
                  if (confirm("Resign this game?")) props.onResign!(actor);
                }}
              >
                <Icon name="flag" /> Resign
              </button>
            )}
          </div>
        )}
        {game.result && !showOver && (
          <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="font-semibold">{describeResult(game.result)}</span>
            <div className="flex flex-wrap gap-2">{gameOverActions}</div>
          </div>
        )}
        {side}
      </div>
    </div>
  );
}
