import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Board, type BoardHandle } from "@/ui/board/Board";
import { PieceImg, type PieceCode } from "@/ui/board/pieces";
import { Icon } from "@/ui/icons";
import { START_PLACEMENT, buildFen, placementFromFen, positionProblems, possibleCastling, type Placement, type PositionMeta } from "@/core/chess/position";
import type { Color } from "@/core/chess/rules";
import { useReview } from "@/store/review";
import { useGuide } from "@/ui/mascot/guide";

const PALETTE: PieceCode[] = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];
type Tool = PieceCode | "hand" | "erase";

const PRESETS: { name: string; fen: string }[] = [
  { name: "Start", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
  { name: "Empty kings", fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1" },
  { name: "K+Q vs K", fen: "8/8/8/4k3/8/8/8/3QK3 w - - 0 1" },
  { name: "K+R vs K", fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1" },
  { name: "Lucena", fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1" },
  { name: "Philidor", fen: "4k3/8/3r4/3PK3/8/8/8/7R b - - 0 1" },
  { name: "Pawn race", fen: "8/p7/8/8/8/8/7P/k6K w - - 0 1" },
];

export default function EditorPage() {
  const navigate = useNavigate();
  const openReview = useReview((s) => s.open);
  const boardRef = useRef<BoardHandle>(null);
  const [placement, setPlacement] = useState<Placement>(() => ({ ...START_PLACEMENT }));
  const [meta, setMeta] = useState<PositionMeta>({ turn: "w", castling: { K: true, Q: true, k: true, q: true }, ep: null });
  const [orientation, setOrientation] = useState<Color>("w");
  const [tool, setTool] = useState<Tool>("hand");
  const [fenInput, setFenInput] = useState("");
  const [paletteDrag, setPaletteDrag] = useState<{ code: PieceCode; x: number; y: number; x0: number; y0: number } | null>(null);
  const fen = buildFen(placement, meta);
  const problems = positionProblems(fen);
  const canCastle = possibleCastling(placement);

  useEffect(() => {
    setFenInput(fen);
  }, [fen]);

  const put = (sq: string, code: PieceCode | null) =>
    setPlacement((p) => {
      const next = { ...p };
      if (code) next[sq] = code;
      else delete next[sq];
      return next;
    });

  const onSquare = (sq: string) => {
    if (tool === "hand") return;
    if (tool === "erase") put(sq, null);
    else put(sq, placement[sq] === tool ? null : tool);
  };

  // Dragging a piece from the palette onto the board.
  useEffect(() => {
    if (!paletteDrag) return;
    const move = (e: PointerEvent) => setPaletteDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const sq = boardRef.current?.squareAt(e.clientX, e.clientY);
      if (sq) put(sq, paletteDrag.code);
      setPaletteDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [paletteDrag?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFen = (text: string) => {
    const parts = text.trim().split(/\s+/);
    if (!/^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+$/.test(parts[0] ?? "")) {
      useGuide.getState().say("That doesn't look like a FEN. It should start like rnbqkbnr/pppppppp/8/…", "surprised");
      return;
    }
    setPlacement(placementFromFen(parts[0]));
    const c = parts[2] ?? "-";
    setMeta({ turn: parts[1] === "b" ? "b" : "w", castling: { K: c.includes("K"), Q: c.includes("Q"), k: c.includes("k"), q: c.includes("q") }, ep: parts[3] && parts[3] !== "-" ? parts[3] : null });
  };

  const palettePiece = (code: PieceCode) => (
    <button
      key={code}
      className={`aspect-square rounded-tile p-0.5 transition-colors ${tool === code ? "bg-accent/30 ring-2 ring-accent" : "hover:bg-surface-hover"}`}
      onClick={() => setTool(tool === code ? "hand" : code)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        setPaletteDrag({ code, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      }}
      style={{ touchAction: "none" }}
      aria-label={code}
    >
      <PieceImg code={code} />
    </button>
  );

  const playable = problems.length === 0;

  return (
    <div className="space-y-3">
      <h1>Free board</h1>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-260px))] lg:max-w-[calc(100dvh-160px)]">
          <div className="mb-2 grid grid-cols-6 gap-1">{PALETTE.slice(6).map(palettePiece)}</div>
          <Board
            ref={boardRef}
            fen={fen}
            orientation={orientation}
            free
            drawable
            onMove={(from, to) =>
              setPlacement((p) => {
                const next = { ...p };
                next[to] = p[from];
                delete next[from];
                return next;
              })
            }
            onRemove={(from) => put(from, null)}
            onSquareClick={onSquare}
          />
          <div className="mt-2 grid grid-cols-6 gap-1">{PALETTE.slice(0, 6).map(palettePiece)}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={tool === "hand" ? "chip-active" : "chip"} onClick={() => setTool("hand")}>
              ✋ Move
            </button>
            <button className={tool === "erase" ? "chip-active" : "chip"} onClick={() => setTool("erase")}>
              <span className="inline-flex items-center gap-1">
                <Icon name="trash" size={14} /> Erase
              </span>
            </button>
            <span className="self-center text-xs muted">Drag pieces, drop them off the board to remove, or pick a piece and tap squares.</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="card space-y-3">
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => loadFen(PRESETS[0].fen)}>
                <Icon name="refresh" /> Start
              </button>
              <button className="btn" onClick={() => setPlacement({})}>
                <Icon name="trash" /> Clear
              </button>
              <button className="btn" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
                <Icon name="flip" /> Flip
              </button>
            </div>
            <div>
              <span className="label">Presets</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.slice(1).map((p) => (
                  <button key={p.name} className="chip text-xs" onClick={() => loadFen(p.fen)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Side to move</span>
              <div className="flex gap-2">
                {(["w", "b"] as Color[]).map((c) => (
                  <button key={c} className={meta.turn === c ? "chip-active" : "chip"} onClick={() => setMeta({ ...meta, turn: c, ep: null })}>
                    {c === "w" ? "White" : "Black"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Castling</span>
              <div className="grid grid-cols-2 gap-1 text-sm">
                {(
                  [
                    ["K", "White O-O"],
                    ["Q", "White O-O-O"],
                    ["k", "Black O-O"],
                    ["q", "Black O-O-O"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className={`flex items-center gap-2 ${canCastle[k] ? "" : "opacity-40"}`}>
                    <input type="checkbox" disabled={!canCastle[k]} checked={meta.castling[k] && canCastle[k]} onChange={(e) => setMeta({ ...meta, castling: { ...meta.castling, [k]: e.target.checked } })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="label">FEN</span>
              <div className="flex gap-1">
                <input className="input font-mono text-xs" value={fenInput} onChange={(e) => setFenInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadFen(fenInput)} />
                <button className="btn-icon btn" onClick={() => loadFen(fenInput)} aria-label="Load FEN">
                  <Icon name="check" />
                </button>
                <button className="btn-icon btn" onClick={() => navigator.clipboard?.writeText(fen)} aria-label="Copy FEN">
                  <Icon name="copy" />
                </button>
              </div>
            </div>
            {problems.length > 0 && (
              <ul className="space-y-1 rounded-control bg-danger/10 p-2 text-xs text-danger">
                {problems.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="card grid gap-2">
            <button
              className="btn-primary"
              disabled={!playable}
              onClick={() => {
                openReview({ id: `pos-${fen}`, pgn: `[SetUp "1"]\n[FEN "${fen}"]\n\n*`, white: "White", black: "Black", orientation });
                navigate("/review");
              }}
            >
              <Icon name="chart" /> Analyze this position
            </button>
            <button className="btn" disabled={!playable} onClick={() => navigate("/play", { state: { fen } })}>
              <Icon name="play" /> Play from here (mascot or local)
            </button>
            <button className="btn" disabled={!playable} onClick={() => navigate("/online", { state: { fen } })}>
              <Icon name="users" /> Play from here online
            </button>
          </div>
        </div>
      </div>
      {paletteDrag && Math.hypot(paletteDrag.x - paletteDrag.x0, paletteDrag.y - paletteDrag.y0) > 6 && (
        <div className="pointer-events-none fixed z-50 h-14 w-14" style={{ left: paletteDrag.x - 28, top: paletteDrag.y - 28 }}>
          <PieceImg code={paletteDrag.code} />
        </div>
      )}
    </div>
  );
}
