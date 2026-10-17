import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PERSONAS, findPersona } from "@/core/ai/personas";
import { checkTimeout, createGame, currentFen, makeMove, offerDraw, resign, sideToMove, takeback, toPgn, other, type GameState } from "@/core/chess/game";
import { describeRules, type Color } from "@/core/chess/rules";
import { sharedEngine } from "@/core/engine/engine";
import { formatScore } from "@/core/engine/uci";
import { useReview } from "@/store/review";
import { useSettings } from "@/store/settings";
import { GameView } from "@/ui/game/GameView";
import { RulesEditor, Toggle, rulesValid } from "@/ui/game/RulesEditor";
import { Icon } from "@/ui/icons";
import { Mascot, type Mood } from "@/ui/mascot/Mascot";
import { ARROW } from "@/ui/palette";
import { usePlay } from "./playStore";
import { usePersonaMove } from "./usePersonaMove";
import type { Arrow } from "@/ui/board/Board";

export default function PlayPage() {
  const { game } = usePlay();
  const location = useLocation();
  const setSetup = usePlay((s) => s.setSetup);
  // Coming from the free board with a position.
  useEffect(() => {
    const fen = (location.state as { fen?: string } | null)?.fen;
    if (fen) {
      const setup = usePlay.getState().setup;
      setSetup({ rules: { ...setup.rules, start: "fen", fen } });
      usePlay.getState().setGame(null);
    }
  }, [location.state, setSetup]);
  return game ? <PlayingScreen /> : <SetupScreen />;
}

function SetupScreen() {
  const { setup, setSetup, setGame } = usePlay();
  const persona = findPersona(setup.personaId);
  const start = () => {
    const human: Color = setup.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : setup.color;
    const rules = setup.rules.start === "shuffle" ? { ...setup.rules, shuffleSeed: Math.floor(Math.random() * 1e9) } : setup.rules;
    sharedEngine().newGame();
    setGame(createGame(rules), human);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1>Play</h1>
      <div className="flex gap-2">
        <button className={setup.mode === "mascot" ? "tab-active" : "tab"} onClick={() => setSetup({ mode: "mascot" })}>
          vs Mascot
        </button>
        <button className={setup.mode === "local" ? "tab-active" : "tab"} onClick={() => setSetup({ mode: "local" })}>
          2 players · same device
        </button>
      </div>

      {setup.mode === "mascot" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSetup({ personaId: p.id })}
              className={`card flex flex-col items-center gap-1 p-3 text-center transition-all hover:-translate-y-0.5 ${
                p.id === setup.personaId ? "ring-2 ring-accent" : ""
              }`}
            >
              <Mascot persona={p} size={64} mood={p.id === setup.personaId ? "happy" : "idle"} />
              <span className="font-bold">{p.name}</span>
              <span className="badge">~{p.elo}</span>
              <span className="text-xs leading-snug muted">{p.tagline}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-4">
          <h2>Rules</h2>
          <RulesEditor rules={setup.rules} onChange={(rules) => setSetup({ rules })} hide={setup.mode === "local" ? ["hints"] : []} />
        </div>
        <div className="card flex flex-col gap-4">
          <h2>Side</h2>
          <div className="flex gap-2">
            {(["w", "random", "b"] as const).map((c) => (
              <button key={c} className={setup.color === c ? "chip-active" : "chip"} onClick={() => setSetup({ color: c })}>
                {c === "w" ? "White" : c === "b" ? "Black" : "Random"}
              </button>
            ))}
          </div>
          {setup.mode === "local" && <Toggle label="Flip board after each move" checked={setup.autoFlip} onChange={(autoFlip) => setSetup({ autoFlip })} />}
          <div className="mt-auto flex items-center gap-3 rounded-card bg-surface-hover p-3">
            {setup.mode === "mascot" ? <Mascot persona={persona} size={52} mood="smug" /> : <Icon name="users" size={36} />}
            <div className="text-sm">
              <div className="font-semibold">{setup.mode === "mascot" ? `vs ${persona.name} (~${persona.elo})` : "Local game"}</div>
              <div className="muted">{describeRules(setup.rules)}</div>
            </div>
          </div>
          <button className="btn-primary py-3 text-base" disabled={!rulesValid(setup.rules)} onClick={start}>
            <Icon name="play" /> Start game
          </button>
        </div>
      </div>
    </div>
  );
}

function reaction(prevCp: number | null, cp: number, aiColor: Color): { text: string; mood: Mood } | null {
  if (prevCp === null) return null;
  const sign = aiColor === "w" ? 1 : -1;
  const delta = sign * (cp - prevCp);
  if (Math.abs(cp) > 50_000 && sign * cp > 0) return { text: "I see a forced mate… hoo hoo!", mood: "smug" };
  if (delta > 250) return { text: pick(["Ooh! Was that a gift?", "Hoo! I think you missed something.", "Thank you very much!"]), mood: "surprised" };
  if (delta < -150) return { text: pick(["Hmm… good move!", "Ouch, I didn't see that.", "You're putting me under pressure!"]), mood: "sad" };
  return null;
}
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function PlayingScreen() {
  const { setup, game, human, setGame } = usePlay();
  const navigate = useNavigate();
  const openReview = useReview((s) => s.open);
  const playerName = useSettings((s) => s.playerName) || "You";
  const g = game as GameState;
  const persona = findPersona(setup.personaId);
  const vsAi = setup.mode === "mascot";
  const aiColor: Color | null = vsAi ? other(human) : null;
  const [orientation, setOrientation] = useState<Color>(vsAi ? human : "w");
  const [hint, setHint] = useState<Arrow[]>([]);
  const [bubble, setBubble] = useState<{ text: string; mood: Mood } | null>({ text: vsAi ? "Good luck, have fun!" : "", mood: "happy" });
  const prevCp = useRef<number | null>(null);
  // The setup screen may be scrolled down: show the board.
  useEffect(() => window.scrollTo(0, 0), []);

  const apply = (next: GameState) => setGame(next);
  const move = (uci: string) => {
    const r = makeMove(usePlay.getState().game!, uci, Date.now());
    if (r.ok) {
      apply(r.state);
      setHint([]);
    }
  };

  const ai = usePersonaMove(g, aiColor, persona, (uci) => {
    move(uci);
    const after = usePlay.getState().game!;
    const san = after.moves[after.moves.length - 1]?.san ?? "";
    if (san.includes("+") && !san.includes("#")) setBubble({ text: "Check!", mood: "smug" });
    else if (san.includes("x") && Math.random() < 0.35) setBubble({ text: pick(["Yum!", "I'll take that.", "Snack time."]), mood: "smug" });
  });

  // React to the player's moves using the engine's evaluation.
  useEffect(() => {
    if (ai.scoreCp === null || !aiColor) return;
    const r = reaction(prevCp.current, ai.scoreCp, aiColor);
    if (r) setBubble(r);
    prevCp.current = ai.scoreCp;
  }, [ai.scoreCp, aiColor]);

  // Clock flag.
  useEffect(() => {
    if (!g.clocks || g.result || g.turnStartedAt === null) return;
    const id = setInterval(() => {
      const timed = checkTimeout(usePlay.getState().game!, Date.now());
      if (timed) apply(timed);
    }, 200);
    return () => clearInterval(id);
  });

  // End of game reactions.
  useEffect(() => {
    if (!g.result || !vsAi) return;
    if (g.result.winner === aiColor) setBubble({ text: "Good game! Want a rematch?", mood: "happy" });
    else if (g.result.winner === human) setBubble({ text: "Well played! You got me.", mood: "sad" });
    else setBubble({ text: "A draw! Nicely fought.", mood: "idle" });
  }, [g.result, vsAi, aiColor, human]);

  // Local games: follow the side to move.
  useEffect(() => {
    if (!vsAi && setup.autoFlip) setOrientation(sideToMove(g));
  }, [g, vsAi, setup.autoFlip]);

  const players = useMemo(() => {
    const mascot = { name: `${persona.name} (${persona.elo})`, avatar: <Mascot persona={persona} size={34} mood={ai.thinking ? "thinking" : bubble?.mood ?? "idle"} /> };
    const me = { name: playerName };
    if (!vsAi) return { w: { name: "White" }, b: { name: "Black" } };
    return human === "w" ? { w: me, b: mascot } : { w: mascot, b: me };
  }, [persona, ai.thinking, bubble, vsAi, human, playerName]);

  const askHint = async () => {
    const job = sharedEngine().analyse(currentFen(g), { depth: 14, multipv: 1 }, true);
    try {
      const a = await job.promise;
      if (a.bestmove) setHint([{ from: a.bestmove.slice(0, 2), to: a.bestmove.slice(2, 4), color: ARROW.hint }]);
      setBubble({ text: `Try this one. The engine says ${formatScore(a.lines[0]?.score)}.`, mood: "talking" });
    } catch {
      /* cancelled */
    }
  };

  const onDraw = (color: Color) => {
    if (vsAi) {
      // The mascot accepts a draw when it is not better.
      const cp = ai.scoreCp ?? 0;
      const forAi = aiColor === "w" ? cp : -cp;
      if (forAi <= 30 && g.moves.length >= 20) {
        const r = offerDraw({ ...g, drawOffer: aiColor }, color, Date.now());
        if (r.ok) apply(r.state);
      } else setBubble({ text: g.moves.length < 20 ? "Draw? We've barely started!" : "No thanks, I like my position.", mood: "smug" });
      return;
    }
    const r = offerDraw(g, color, Date.now());
    if (r.ok) apply(r.state);
  };

  const onTakeback = () => {
    const count = vsAi && sideToMove(g) === human && g.moves.length >= 2 ? 2 : 1;
    const r = takeback(g, count, Date.now());
    if (r.ok) {
      apply(r.state);
      prevCp.current = null;
      if (vsAi) setBubble({ text: pick(["Take your time.", "Second chance!", "Sure, try again."]), mood: "idle" });
    }
  };

  const analyze = () => {
    const white = players.w.name;
    const black = players.b.name;
    openReview({ id: `local-${Date.now()}`, pgn: toPgn(g, { White: white, Black: black }), white, black, orientation: vsAi ? human : "w" });
    navigate("/review");
  };

  const rematch = () => {
    const rules = setup.rules.start === "shuffle" ? { ...g.rules, shuffleSeed: Math.floor(Math.random() * 1e9) } : g.rules;
    const nextHuman = vsAi ? other(human) : human;
    prevCp.current = null;
    setGame(createGame(rules), nextHuman);
    if (vsAi) setOrientation(nextHuman);
    setBubble({ text: "Let's go again! Colours swapped.", mood: "happy" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate text-lg sm:text-2xl">{vsAi ? `vs ${persona.name}` : "Local game"}</h1>
        <button
          className="btn"
          onClick={() => {
            if (g.result || confirm("Leave this game?")) setGame(null);
          }}
        >
          <Icon name="x" /> {g.result ? "New game" : "Quit"}
        </button>
      </div>
      <GameView
        game={g}
        players={players}
        myColors={vsAi ? [human] : ["w", "b"]}
        orientation={orientation}
        onFlip={() => setOrientation((o) => other(o))}
        onMove={move}
        onResign={(c) => {
          const r = resign(g, c, Date.now());
          if (r.ok) apply(r.state);
        }}
        onOfferDraw={onDraw}
        onTakeback={g.rules.takebacks ? onTakeback : undefined}
        arrows={hint}
        gameOverActions={
          <>
            <button className="btn-primary" onClick={rematch}>
              <Icon name="refresh" /> Rematch
            </button>
            <button className="btn" onClick={analyze}>
              <Icon name="chart" /> Analyze
            </button>
          </>
        }
        side={
          <>
            {vsAi && bubble?.text && (
              <div className="card flex items-start gap-3 p-3">
                <Mascot persona={persona} size={48} mood={ai.thinking ? "thinking" : bubble.mood} />
                <p className="animate-pop rounded-card bg-surface-hover px-3 py-2 text-sm" key={bubble.text}>
                  {ai.thinking ? "Hmm, let me think…" : bubble.text}
                </p>
              </div>
            )}
            {vsAi && g.rules.hints && !g.result && sideToMove(g) === human && (
              <button className="btn" onClick={askHint}>
                <Icon name="bulb" /> Hint
              </button>
            )}
            {!vsAi && g.drawOffer && !g.result && (
              <div className="card p-3 text-sm">
                {g.drawOffer === "w" ? "White" : "Black"} offers a draw.{" "}
                <button className="font-semibold text-accent" onClick={() => onDraw(other(g.drawOffer!))}>
                  Accept
                </button>
              </div>
            )}
          </>
        }
      />
    </div>
  );
}

