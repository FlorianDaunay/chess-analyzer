import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import { parsePgn } from "@/core/chess/pgn";
import { addMove, deleteNode, isOnMainLine, mainLine, pathTo, promoteNode, treeFromMoves, type MoveTree } from "@/core/chess/tree";
import { isPromotion, legalDests } from "@/core/chess/game";
import { epdOf, loadOpenings, type OpeningBook } from "@/core/chess/openings";
import type { GameAnalysis, MoveAnalysis } from "@/core/analysis/classify";
import { formatScore, winPercent } from "@/core/engine/uci";
import { useReview } from "@/store/review";
import { Board, type Arrow } from "@/ui/board/Board";
import { Icon } from "@/ui/icons";
import { Mascot, type Mood } from "@/ui/mascot/Mascot";
import { ARROW, CLASS_STYLE, type MoveClass } from "@/ui/palette";
import { playMoveSound } from "@/ui/sound";
import { Toggle } from "@/ui/game/RulesEditor";
import { useAnalysis } from "@/features/analyze/analysisStore";
import { EvalBar, EvalGraph } from "./EvalGraph";
import { MoveTreeView } from "./MoveTreeView";
import { pvToSan, useLiveEval } from "./useLiveEval";

const SUMMARY_CLASSES: MoveClass[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];

function kingSquareInCheck(fen: string): string | null {
  const c = new Chess(fen);
  if (!c.inCheck()) return null;
  for (const row of c.board()) for (const p of row) if (p?.type === "k" && p.color === c.turn()) return p.square;
  return null;
}

function comment(m: MoveAnalysis, bestSan: string): { text: string; mood: Mood } {
  const s = `${m.san}`;
  switch (m.cls) {
    case "brilliant":
      return { text: `${s} is brilliant!! A sacrifice that works.`, mood: "happy" };
    case "great":
      return { text: `${s} is a great move — the only one that keeps the advantage.`, mood: "happy" };
    case "best":
      return { text: `${s} is the best move.`, mood: "happy" };
    case "excellent":
      return { text: `${s} is excellent. ${bestSan !== s ? `${bestSan} was a tiny bit better.` : ""}`, mood: "idle" };
    case "good":
      return { text: `${s} is good. The engine prefers ${bestSan}.`, mood: "idle" };
    case "book":
      return { text: `${s} is a book move.`, mood: "idle" };
    case "forced":
      return { text: `${s} was the only legal move.`, mood: "idle" };
    case "inaccuracy":
      return { text: `${s} is an inaccuracy. ${bestSan} was better.`, mood: "thinking" };
    case "mistake":
      return { text: `${s} is a mistake (${formatScore(m.before)} → ${formatScore(m.after)}). Best was ${bestSan}.`, mood: "surprised" };
    case "miss":
      return { text: `${s} misses a win! ${bestSan} would have kept a big advantage.`, mood: "surprised" };
    case "blunder":
      return { text: `${s} is a blunder (${formatScore(m.before)} → ${formatScore(m.after)}). ${bestSan} was the move.`, mood: "sad" };
  }
}

export default function ReviewPage() {
  const input = useReview((s) => s.input);
  if (!input)
    return (
      <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 py-10 text-center">
        <Mascot size={80} mood="thinking" />
        <p>No game to review yet.</p>
        <div className="flex gap-2">
          <Link to="/analyze" className="btn-primary">
            Analyze chess.com games
          </Link>
          <Link to="/board" className="btn">
            Free board
          </Link>
        </div>
      </div>
    );
  return <Review key={input.id + (input.ply ?? "")} />;
}

function Review() {
  const input = useReview((s) => s.input)!;
  const navigate = useNavigate();
  const parsed = useMemo(() => parsePgn(input.pgn), [input.pgn]);
  const [tree, setTree] = useState<MoveTree>(() => treeFromMoves(parsed.startFen, parsed.ucis, parsed.clocks));
  const [current, setCurrent] = useState<string>(() => {
    const line = mainLine(tree);
    const ply = input.ply ?? 0;
    return ply > 0 && line[ply - 1] ? line[ply - 1].id : tree.rootId;
  });
  const [orientation, setOrientation] = useState<"w" | "b">(input.orientation ?? "w");
  const [engineOn, setEngineOn] = useState(true);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [book, setBook] = useState<OpeningBook | null>(null);
  const [retry, setRetry] = useState<{ fromId: string; target: MoveAnalysis } | null>(null);
  const [retryResult, setRetryResult] = useState<string | null>(null);
  const store = useAnalysis();

  const node = tree.nodes[current];
  const fen = node.fen;
  const live = useLiveEval(fen, engineOn);
  const onMain = isOnMainLine(tree, current);
  const mainMove = onMain && node.ply > 0 && analysis ? analysis.moves[node.ply - 1] : null;
  const nextMain = onMain && analysis ? analysis.moves[node.ply] : null;

  useEffect(() => {
    void loadOpenings().then(setBook);
    let alive = true;
    void store.getAnalysis(input.id).then((a) => alive && a && setAnalysis(a));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.id]);

  const runAnalysis = async () => {
    setProgress(0);
    try {
      const a = await store.analyzeOne(input.id, input.pgn, setProgress);
      setAnalysis(a);
    } finally {
      setProgress(null);
    }
  };

  const go = (id: string) => {
    setCurrent(id);
    setRetryResult(null);
  };
  const back = () => node.parent && go(node.parent);
  const forward = () => node.children[0] && go(node.children[0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") back();
      else if (e.key === "ArrowRight") forward();
      else if (e.key === "Home") go(tree.rootId);
      else if (e.key === "End") {
        const line = pathTo(tree, current);
        let n = line.length ? line[line.length - 1] : tree.nodes[tree.rootId];
        while (n.children.length) n = tree.nodes[n.children[0]];
        go(n.id);
      } else if (e.key === "f") setOrientation((o) => (o === "w" ? "b" : "w"));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const play = (uci: string) => {
    const r = addMove(tree, current, uci);
    if (!r) return;
    const played = r.tree.nodes[r.nodeId];
    playMoveSound(played.san);
    // Retry mode: did the player find a better move than in the game?
    if (retry && current === retry.fromId) {
      const best = retry.target.best;
      if (played.uci === best) setRetryResult("Correct! That's the best move.");
      else if (played.uci === retry.target.uci) setRetryResult("That's the move from the game… try something else!");
      else setRetryResult("Not the engine's first choice. Check the evaluation on the right.");
      setRetry(null);
    }
    setTree(r.tree);
    setCurrent(r.nodeId);
  };

  const bestSan = (m: MoveAnalysis) => (m.best ? pvToSan(m.fenBefore, [m.best])[0] ?? m.best : "—");
  const openingName = useMemo(() => {
    if (!book) return null;
    const path = pathTo(tree, current);
    for (let i = path.length - 1; i >= 0; i--) {
      const o = book.byEpd.get(epdOf(path[i].fen));
      if (o) return `${o.eco} · ${o.name}`;
    }
    return null;
  }, [book, tree, current]);

  // Arrows: best move from live engine (or stored analysis), and the game's next move.
  const arrows: Arrow[] = [];
  const liveBest = live?.lines[0]?.pv[0];
  if (engineOn && liveBest) {
    arrows.push({ from: liveBest.slice(0, 2), to: liveBest.slice(2, 4), color: ARROW.best });
    const second = live?.lines[1]?.pv[0];
    if (second) arrows.push({ from: second.slice(0, 2), to: second.slice(2, 4), color: ARROW.alt, thin: true });
  } else if (nextMain?.best) arrows.push({ from: nextMain.best.slice(0, 2), to: nextMain.best.slice(2, 4), color: ARROW.best });

  const badges: Record<string, { label: string; color: string }> = {};
  if (mainMove && node.uci) badges[node.uci.slice(2, 4)] = { label: CLASS_STYLE[mainMove.cls].symbol, color: CLASS_STYLE[mainMove.cls].color };

  const evalScore = live?.lines[0]?.score ?? (onMain && analysis ? analysis.positions[node.ply]?.score : undefined);
  const wp = evalScore ? winPercent(evalScore) : 50;
  const dests = useMemo(() => legalDests(fen), [fen]);
  const mascotLine = mainMove ? comment(mainMove, bestSan(mainMove)) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl">
            {input.white} <span className="muted">vs</span> {input.black}
          </h1>
          <p className="truncate text-xs muted">{openingName ?? parsed.headers.Event ?? ""}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(fen)} title="Copy FEN">
            <Icon name="copy" /> FEN
          </button>
          <button className="btn" onClick={() => navigate("/play", { state: { fen } })} title="Play this position against the mascot">
            <Icon name="play" /> Play from here
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-270px))] lg:max-w-[calc(100dvh-200px)]">
          <div className="flex gap-2">
            {engineOn && <EvalBar wp={wp} label={formatScore(evalScore)} orientation={orientation} className="w-3 shrink-0 sm:w-5" />}
            <div className="min-w-0 flex-1">
              <Board
                fen={fen}
                orientation={orientation}
                dests={dests}
                onMove={(f, t, p) => play(f + t + (p ?? ""))}
                needsPromotion={(f, t) => isPromotion(fen, f, t)}
                lastMove={node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : null}
                check={kingSquareInCheck(fen)}
                arrows={arrows}
                badges={badges}
              />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-1">
              <button className="btn-icon btn" onClick={() => go(tree.rootId)} aria-label="Start">
                <Icon name="first" />
              </button>
              <button className="btn-icon btn" onClick={back} aria-label="Back">
                <Icon name="back" />
              </button>
              <button className="btn-icon btn" onClick={forward} aria-label="Forward">
                <Icon name="forward" />
              </button>
              <button
                className="btn-icon btn"
                onClick={() => {
                  let n = node;
                  while (n.children.length) n = tree.nodes[n.children[0]];
                  go(n.id);
                }}
                aria-label="End"
              >
                <Icon name="last" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Toggle label="Engine" checked={engineOn} onChange={setEngineOn} />
              <button className="btn-icon btn" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))} aria-label="Flip">
                <Icon name="flip" />
              </button>
            </div>
          </div>
          {analysis && (
            <div className="mt-3">
              <EvalGraph
                analysis={analysis}
                ply={onMain ? node.ply : pathTo(tree, current).findIndex((n) => !isOnMainLine(tree, n.id))}
                onSelect={(ply) => go(ply === 0 ? tree.rootId : mainLine(tree)[ply - 1].id)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* Mascot coach */}
          <div className="card flex items-start gap-3 p-3">
            <Mascot size={52} mood={retryResult?.startsWith("Correct") ? "happy" : mascotLine?.mood ?? "idle"} className="shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              {retryResult ? (
                <p className="font-semibold">{retryResult}</p>
              ) : retry ? (
                <p>Find a better move than {retry.target.san}. Play it on the board!</p>
              ) : mainMove && mascotLine ? (
                <>
                  <p>
                    <span className="mr-1 rounded px-1 text-xs font-bold text-white" style={{ background: CLASS_STYLE[mainMove.cls].color }}>
                      {CLASS_STYLE[mainMove.cls].label}
                    </span>
                    {mascotLine.text}
                  </p>
                  {["inaccuracy", "mistake", "miss", "blunder"].includes(mainMove.cls) && node.parent && (
                    <button
                      className="mt-2 text-xs font-semibold text-accent"
                      onClick={() => {
                        setRetry({ fromId: node.parent!, target: mainMove });
                        setRetryResult(null);
                        setCurrent(node.parent!);
                      }}
                    >
                      ↺ Retry this move
                    </button>
                  )}
                </>
              ) : !analysis ? (
                <p>Run a full analysis to get my comments on every move. Or just play moves on the board to explore.</p>
              ) : !onMain ? (
                <p>You're exploring a variation. The engine lines below show how it would go.</p>
              ) : (
                <p>Use the arrows (or ← →) to step through the game.</p>
              )}
            </div>
          </div>

          {/* Engine lines */}
          {engineOn && (
            <div className="card p-3">
              <div className="mb-1 flex items-center justify-between text-xs muted">
                <span>Stockfish 17.1 · depth {live?.depth ?? "…"}</span>
                <span className="font-mono text-sm font-bold text-text-primary">{formatScore(evalScore)}</span>
              </div>
              {(live?.lines ?? []).map((l) => {
                const sans = pvToSan(fen, l.pv);
                return (
                  <button key={l.multipv} className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-surface-hover" onClick={() => l.pv[0] && play(l.pv[0])} title="Play this move">
                    <span className="w-12 shrink-0 font-mono font-bold tabular-nums">{formatScore(l.score)}</span>
                    <span className="truncate font-mono text-xs text-text-secondary">{sans.join(" ")}</span>
                  </button>
                );
              })}
              {!live && <p className="text-sm muted">Thinking…</p>}
            </div>
          )}

          {/* Moves */}
          <div className="card p-3">
            <MoveTreeView tree={tree} current={current} onSelect={go} analysis={analysis} />
            {!onMain && (
              <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                <button
                  className="btn-sm btn"
                  onClick={() => {
                    // Delete the whole variation this move belongs to.
                    const path = pathTo(tree, current);
                    const start = path.find((n) => !isOnMainLine(tree, n.id))!;
                    setTree(deleteNode(tree, start.id));
                    setCurrent(start.parent!);
                  }}
                >
                  <Icon name="trash" size={14} /> Delete variation
                </button>
                <button className="btn-sm btn" onClick={() => setTree(promoteNode(tree, current))}>
                  Promote
                </button>
              </div>
            )}
          </div>

          {/* Summary */}
          {analysis ? (
            <div className="card p-3">
              <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-sm">
                <span />
                <span className="w-16 truncate text-right font-semibold">{input.white}</span>
                <span className="w-16 truncate text-right font-semibold">{input.black}</span>
                <span className="muted">Accuracy</span>
                <span className="text-right text-lg font-bold tabular-nums">{analysis.accuracy.w.toFixed(1)}</span>
                <span className="text-right text-lg font-bold tabular-nums">{analysis.accuracy.b.toFixed(1)}</span>
                {SUMMARY_CLASSES.map((c) => (
                  <div key={c} className="contents">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white" style={{ background: CLASS_STYLE[c].color }}>
                        {CLASS_STYLE[c].symbol}
                      </span>
                      {CLASS_STYLE[c].label}
                    </span>
                    <span className="text-right tabular-nums">{analysis.counts.w[c] ?? 0}</span>
                    <span className="text-right tabular-nums">{analysis.counts.b[c] ?? 0}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs muted">Stockfish depth {analysis.depth}. Click a move above or a point on the graph.</p>
            </div>
          ) : (
            parsed.ucis.length > 0 && (
              <button className="btn-primary" onClick={runAnalysis} disabled={progress !== null}>
                <Icon name="chart" /> {progress !== null ? `Analyzing… ${Math.round(progress * 100)}%` : "Full game analysis"}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
