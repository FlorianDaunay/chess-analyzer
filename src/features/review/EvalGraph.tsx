import { useState } from "react";
import type { GameAnalysis } from "@/core/analysis/classify";
import { formatScore, winPercent } from "@/core/engine/uci";
import { Tooltip, useWidth } from "@/ui/charts/charts";
import { CLASS_STYLE } from "@/ui/palette";

/** White's winning chances across the game. Click to jump; dots mark mistakes. */
export function EvalGraph({ analysis, ply, onSelect, height = 110 }: { analysis: GameAnalysis; ply: number; onSelect: (ply: number) => void; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = analysis.positions.length;
  if (n < 2) return null;
  const sx = (i: number) => (i / (n - 1)) * width;
  const sy = (wp: number) => height - (wp / 100) * height;
  const pts = analysis.positions.map((p, i) => `${sx(i)},${sy(winPercent(p.score))}`);
  const area = `M0,${height} L${pts.join(" L")} L${width},${height} Z`;
  const marked = analysis.moves.filter((m) => m.cls === "blunder" || m.cls === "mistake" || m.cls === "brilliant" || m.cls === "great" || m.cls === "miss");
  const hoverMove = hover !== null && hover > 0 ? analysis.moves[hover - 1] : null;

  return (
    <div ref={ref} className="relative w-full select-none overflow-hidden rounded-tile" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="cursor-pointer"
          onPointerMove={(e) => {
            const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
            setHover(Math.max(0, Math.min(n - 1, Math.round((x / width) * (n - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
          onClick={() => hover !== null && onSelect(hover)}
        >
          <rect width={width} height={height} fill="#3a3835" />
          <path d={area} fill="#eeeae2" />
          <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="#8a8f98" strokeWidth={1} />
          <line x1={sx(ply)} x2={sx(ply)} y1={0} y2={height} stroke="rgb(var(--color-accent))" strokeWidth={2} />
          {hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={0} y2={height} stroke="#8a8f98" strokeWidth={1} />}
          {marked.map((m) => (
            <circle key={m.ply} cx={sx(m.ply)} cy={sy(winPercent(m.after))} r={4} fill={CLASS_STYLE[m.cls].color} stroke="#ffffff" strokeWidth={1.5} />
          ))}
        </svg>
      )}
      {hover !== null && (
        <Tooltip x={sx(hover)} y={4} width={width}>
          {hoverMove ? (
            <>
              <div className="font-semibold">
                {Math.ceil(hoverMove.ply / 2)}
                {hoverMove.color === "w" ? "." : "..."} {hoverMove.san}{" "}
                <span style={{ color: CLASS_STYLE[hoverMove.cls].color }}>{CLASS_STYLE[hoverMove.cls].symbol}</span>
              </div>
              <div className="muted">
                {CLASS_STYLE[hoverMove.cls].label} · {formatScore(hoverMove.after)}
              </div>
            </>
          ) : (
            <div>Start · {formatScore(analysis.positions[0].score)}</div>
          )}
        </Tooltip>
      )}
    </div>
  );
}

/**
 * White's winning chances as a bar. Vertical next to the board (White at the bottom when White
 * plays up), or horizontal above it on phones (White on the left when White plays up).
 * The caller sets the display class (e.g. "hidden sm:flex").
 */
export function EvalBar({ wp, label, orientation, horizontal = false, className = "" }: { wp: number; label: string; orientation: "w" | "b"; horizontal?: boolean; className?: string }) {
  const whiteShare = Math.max(2, Math.min(98, wp));
  const whiteFirst = orientation === "w";
  const whiteAhead = wp >= 50;
  const direction = horizontal ? (whiteFirst ? "row" : "row-reverse") : whiteFirst ? "column-reverse" : "column";
  // The label sits on the side of the player who is better, in the colour that contrasts there.
  const labelPos = horizontal
    ? whiteAhead === whiteFirst
      ? "left-1.5"
      : "right-1.5"
    : whiteAhead === whiteFirst
      ? "bottom-1 left-0 right-0 text-center"
      : "top-1 left-0 right-0 text-center";
  return (
    <div className={`relative overflow-hidden rounded-[4px] bg-[#3a3835] ${className}`} style={{ flexDirection: direction }}>
      <div className="bg-[#eeeae2] transition-all duration-500" style={horizontal ? { width: `${whiteShare}%` } : { height: `${whiteShare}%` }} />
      <span className={`absolute text-[9px] font-bold leading-none ${horizontal ? "top-1/2 -translate-y-1/2" : ""} ${labelPos} ${whiteAhead ? "text-[#3a3835]" : "text-[#eeeae2]"}`}>
        {label.replace("+", "")}
      </span>
    </div>
  );
}
