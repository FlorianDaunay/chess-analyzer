import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import type { Color } from "@/core/chess/rules";
import { BOARD_THEMES } from "@/ui/palette";
import { useSettings } from "@/store/settings";
import { PieceImg, type PieceCode } from "./pieces";

export interface Arrow {
  from: string;
  to: string;
  color: string;
  /** Thinner arrow (secondary lines). */
  thin?: boolean;
}

export interface SquareBadge {
  label: string;
  color: string;
}

export interface BoardProps {
  fen: string;
  orientation?: Color;
  /** Legal moves per origin square. Pieces without an entry cannot move (unless `free`). */
  dests?: Map<string, string[]>;
  /** Editor mode: any piece goes anywhere, dragging off the board removes it. */
  free?: boolean;
  onMove?: (from: string, to: string, promotion?: string) => void;
  /** Whether a (legal) move needs the promotion picker. */
  needsPromotion?: (from: string, to: string) => boolean;
  onRemove?: (from: string) => void;
  onSquareClick?: (square: string) => void;
  lastMove?: [string, string] | null;
  check?: string | null;
  arrows?: Arrow[];
  /** Square fills, e.g. { e4: "#ff000055" }. */
  marks?: Record<string, string>;
  badges?: Record<string, SquareBadge>;
  /** Right-click (or long-press free) arrows drawn by the user. */
  drawable?: boolean;
  /** Content over the board (game over panel, etc.). */
  overlay?: ReactNode;
  className?: string;
}

export interface BoardHandle {
  squareAt: (clientX: number, clientY: number) => string | null;
}

const FILES = "abcdefgh";

interface Placed {
  key: string;
  sq: string;
  code: PieceCode;
}

function parsePlacement(fen: string): { sq: string; code: PieceCode }[] {
  const out: { sq: string; code: PieceCode }[] = [];
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const color = ch === ch.toUpperCase() ? "w" : "b";
        out.push({ sq: FILES[f] + (8 - r), code: (color + ch.toUpperCase()) as PieceCode });
        f++;
      }
    }
  });
  return out;
}

const coords = (sq: string) => ({ f: FILES.indexOf(sq[0]), r: Number(sq[1]) - 1 });
const dist = (a: string, b: string) => {
  const p = coords(a);
  const q = coords(b);
  return Math.abs(p.f - q.f) + Math.abs(p.r - q.r);
};

let keySeq = 0;

/** Gives pieces stable keys across positions so moves slide instead of blinking. */
function assignKeys(prev: Placed[], next: { sq: string; code: PieceCode }[]): Placed[] {
  const unused = new Set(prev);
  const result: (Placed | null)[] = next.map((p) => {
    const same = prev.find((q) => unused.has(q) && q.sq === p.sq && q.code === p.code);
    if (same) {
      unused.delete(same);
      return same;
    }
    return null;
  });
  return next.map((p, i) => {
    if (result[i]) return result[i]!;
    let best: Placed | null = null;
    for (const q of unused) if (q.code === p.code && (!best || dist(q.sq, p.sq) < dist(best.sq, p.sq))) best = q;
    if (best) {
      unused.delete(best);
      return { key: best.key, sq: p.sq, code: p.code };
    }
    return { key: `p${++keySeq}`, sq: p.sq, code: p.code };
  });
}

export const Board = forwardRef<BoardHandle, BoardProps>(function Board(props, ref) {
  const {
    fen,
    orientation = "w",
    dests,
    free = false,
    onMove,
    needsPromotion,
    onRemove,
    onSquareClick,
    lastMove,
    check,
    arrows = [],
    marks,
    badges,
    drawable = true,
    overlay,
    className = "",
  } = props;
  const settings = useSettings();
  const theme = BOARD_THEMES.find((t) => t.id === settings.boardTheme) ?? BOARD_THEMES[0];
  const boardRef = useRef<HTMLDivElement>(null);
  const prevPieces = useRef<Placed[]>([]);
  const pieces = useMemo(() => {
    const next = assignKeys(prevPieces.current, parsePlacement(fen));
    prevPieces.current = next;
    return next;
  }, [fen]);
  const bySquare = useMemo(() => new Map(pieces.map((p) => [p.sq, p])), [pieces]);

  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number; started: boolean; wasSelected: boolean } | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [userArrows, setUserArrows] = useState<Arrow[]>([]);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [userCircles, setUserCircles] = useState<string[]>([]);

  // A new position clears the selection and the user's drawings.
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
    setUserArrows([]);
    setUserCircles([]);
  }, [fen]);

  const squareAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
      let f = Math.floor(x * 8);
      let r = 7 - Math.floor(y * 8);
      if (orientation === "b") {
        f = 7 - f;
        r = 7 - r;
      }
      return FILES[f] + (r + 1);
    },
    [orientation]
  );
  useImperativeHandle(ref, () => ({ squareAt }), [squareAt]);

  const pos = (sq: string) => {
    const { f, r } = coords(sq);
    return orientation === "w" ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  };

  const canPick = (sq: string) => {
    if (!bySquare.has(sq)) return false;
    if (free) return true;
    return !!dests?.get(sq)?.length;
  };

  const attempt = (from: string, to: string) => {
    if (from === to) return false;
    if (free) {
      onMove?.(from, to);
      return true;
    }
    if (!dests?.get(from)?.includes(to)) return false;
    if (needsPromotion?.(from, to)) setPromotion({ from, to });
    else onMove?.(from, to);
    return true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (e.button === 2) {
      if (drawable) setDrawing(sq);
      return;
    }
    if (e.button !== 0) return;
    setUserArrows([]);
    setUserCircles([]);
    if (promotion) return;
    if (selected && selected !== sq && attempt(selected, sq)) {
      setSelected(null);
      return;
    }
    if (canPick(sq)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDrag({ from: sq, x: e.clientX, y: e.clientY, started: false, wasSelected: selected === sq });
      setSelected(sq);
    } else {
      setSelected(null);
      onSquareClick?.(sq);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.started || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, started: moved });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drawing) {
      const to = squareAt(e.clientX, e.clientY);
      if (to && to === drawing) {
        setUserCircles((c) => (c.includes(to) ? c.filter((s) => s !== to) : [...c, to]));
      } else if (to) {
        setUserArrows((list) => {
          const exists = list.some((a) => a.from === drawing && a.to === to);
          return exists ? list.filter((a) => !(a.from === drawing && a.to === to)) : [...list, { from: drawing, to, color: "#e68a00cc" }];
        });
      }
      setDrawing(null);
      return;
    }
    if (!drag) return;
    const to = squareAt(e.clientX, e.clientY);
    if (drag.started) {
      if (to && to !== drag.from) {
        if (attempt(drag.from, to)) setSelected(null);
      } else if (!to && free) {
        onRemove?.(drag.from);
        setSelected(null);
      }
    } else if (drag.wasSelected) {
      setSelected(null);
      if (free) onSquareClick?.(drag.from);
    } else if (free && onSquareClick) {
      // In the editor a tap on a piece is also a square click (to place/erase with a tool).
      onSquareClick(drag.from);
    }
    setDrag(null);
  };

  const targets = selected && !free ? dests?.get(selected) ?? [] : [];
  const boardSize = boardRef.current?.getBoundingClientRect();
  const squarePx = boardSize ? boardSize.width / 8 : 0;
  const allArrows = [...arrows, ...userArrows];

  const squares = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const f = orientation === "w" ? x : 7 - x;
      const r = orientation === "w" ? 7 - y : y;
      const sq = FILES[f] + (r + 1);
      const light = (f + r) % 2 === 1;
      const isLast = lastMove && (lastMove[0] === sq || lastMove[1] === sq);
      const isSel = selected === sq;
      const isTarget = settings.showLegal && targets.includes(sq);
      const occupied = bySquare.has(sq);
      squares.push(
        <div
          key={sq}
          data-square={sq}
          className="relative"
          style={{ background: light ? theme.light : theme.dark }}
        >
          {(isLast || isSel) && <div className="absolute inset-0" style={{ background: theme.highlight }} />}
          {marks?.[sq] && <div className="absolute inset-0" style={{ background: marks[sq] }} />}
          {check === sq && (
            <div className="absolute inset-0" style={{ background: "radial-gradient(circle, #ff2a2acc 0%, #ff2a2a66 40%, transparent 72%)" }} />
          )}
          {userCircles.includes(sq) && <div className="absolute inset-[4%] rounded-full border-[3px]" style={{ borderColor: "#e68a00cc" }} />}
          {isTarget &&
            (occupied ? (
              <div className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 5px #0000003a" }} />
            ) : (
              <div className="absolute left-1/2 top-1/2 h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/25" />
            ))}
          {settings.coordinates && x === 0 && (
            <span className="pointer-events-none absolute left-[3%] top-[1%] text-[clamp(8px,1.6vw,12px)] font-bold" style={{ color: light ? theme.dark : theme.light }}>
              {r + 1}
            </span>
          )}
          {settings.coordinates && y === 7 && (
            <span className="pointer-events-none absolute bottom-[1%] right-[4%] text-[clamp(8px,1.6vw,12px)] font-bold" style={{ color: light ? theme.dark : theme.light }}>
              {FILES[f]}
            </span>
          )}
        </div>
      );
    }
  }

  return (
    <div className={`relative w-full select-none ${className}`} style={{ aspectRatio: "1 / 1" }}>
      <div
        ref={boardRef}
        className="touch-none-all absolute inset-0 grid grid-cols-8 grid-rows-8 overflow-hidden rounded-[6px] shadow-card"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {squares}
        {pieces.map((p) => {
          const { x, y } = pos(p.sq);
          const dragging = drag?.started && drag.from === p.sq;
          return (
            <div
              key={p.key}
              className="pointer-events-none absolute left-0 top-0 h-[12.5%] w-[12.5%]"
              style={{
                transform: `translate(${x * 100}%, ${y * 100}%)`,
                transition: settings.animations && !drag?.started ? "transform 160ms ease-out" : undefined,
                opacity: dragging ? 0.35 : 1,
                zIndex: 2,
              }}
            >
              <PieceImg code={p.code} />
            </div>
          );
        })}
        {badges &&
          Object.entries(badges).map(([sq, b]) => {
            const { x, y } = pos(sq);
            return (
              <div
                key={"badge" + sq}
                className="pointer-events-none absolute left-0 top-0 h-[12.5%] w-[12.5%]"
                style={{ transform: `translate(${x * 100}%, ${y * 100}%)`, zIndex: 4 }}
              >
                <span
                  className="animate-pop absolute -right-[8%] -top-[8%] flex h-[40%] min-w-[40%] items-center justify-center rounded-full px-[3%] text-[clamp(8px,1.8vw,13px)] font-extrabold text-white shadow"
                  style={{ background: b.color }}
                >
                  {b.label}
                </span>
              </div>
            );
          })}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 8 8" style={{ zIndex: 3 }}>
          {allArrows.map((a, i) => {
            const p = pos(a.from);
            const q = pos(a.to);
            const x1 = p.x + 0.5;
            const y1 = p.y + 0.5;
            const x2 = q.x + 0.5;
            const y2 = q.y + 0.5;
            const len = Math.hypot(x2 - x1, y2 - y1);
            if (len === 0) return null;
            const ux = (x2 - x1) / len;
            const uy = (y2 - y1) / len;
            const w = a.thin ? 0.1 : 0.17;
            const head = a.thin ? 0.3 : 0.42;
            const ex = x2 - ux * head;
            const ey = y2 - uy * head;
            const nx = -uy;
            const ny = ux;
            return (
              <g key={i} opacity={0.95}>
                <line x1={x1 + ux * 0.2} y1={y1 + uy * 0.2} x2={ex} y2={ey} stroke={a.color} strokeWidth={w} strokeLinecap="round" />
                <polygon points={`${x2},${y2} ${ex + nx * head * 0.62},${ey + ny * head * 0.62} ${ex - nx * head * 0.62},${ey - ny * head * 0.62}`} fill={a.color} />
              </g>
            );
          })}
        </svg>
      </div>
      {drag?.started && bySquare.get(drag.from) && boardSize && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: drag.x - squarePx * 0.55, top: drag.y - squarePx * 0.55, width: squarePx * 1.1, height: squarePx * 1.1 }}
        >
          <PieceImg code={bySquare.get(drag.from)!.code} />
        </div>
      )}
      {promotion && (
        <PromotionPicker
          color={bySquare.get(promotion.from)?.code[0] as Color}
          x={pos(promotion.to).x}
          top={pos(promotion.to).y === 0}
          onPick={(p) => {
            onMove?.(promotion.from, promotion.to, p);
            setPromotion(null);
            setSelected(null);
          }}
          onCancel={() => setPromotion(null)}
        />
      )}
      {overlay && <div className="absolute inset-0 z-20">{overlay}</div>}
    </div>
  );
});

function PromotionPicker({ color, x, top, onPick, onCancel }: { color: Color; x: number; top: boolean; onPick: (p: string) => void; onCancel: () => void }) {
  const list = ["q", "n", "r", "b"];
  return (
    <div className="absolute inset-0 z-30 bg-black/40" onPointerDown={onCancel}>
      <div
        className="absolute flex w-[12.5%] flex-col overflow-hidden rounded-md bg-white shadow-overlay"
        style={{ left: `${x * 12.5}%`, ...(top ? { top: 0 } : { bottom: 0 }), flexDirection: top ? "column" : "column-reverse" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {list.map((p) => (
          <button key={p} className="aspect-square w-full hover:bg-amber-100" onClick={() => onPick(p)} aria-label={`Promote to ${p}`}>
            <PieceImg code={(color + p.toUpperCase()) as PieceCode} />
          </button>
        ))}
      </div>
    </div>
  );
}
