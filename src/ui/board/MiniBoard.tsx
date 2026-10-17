import { BOARD_THEMES } from "@/ui/palette";
import { useSettings } from "@/store/settings";
import { placementFromFen } from "@/core/chess/position";
import { PIECE_URL, type PieceCode } from "./pieces";
import type { Arrow } from "./Board";

const FILES = "abcdefgh";

/** Static, light-weight board for lists and thumbnails. */
export function MiniBoard({ fen, orientation = "w", arrows = [], highlight = [], className = "" }: { fen: string; orientation?: "w" | "b"; arrows?: Arrow[]; highlight?: string[]; className?: string }) {
  const themeId = useSettings((s) => s.boardTheme);
  const theme = BOARD_THEMES.find((t) => t.id === themeId) ?? BOARD_THEMES[0];
  const placement = placementFromFen(fen);
  const pos = (sq: string) => {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    return orientation === "w" ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  };
  const cells = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const f = orientation === "w" ? x : 7 - x;
      const r = orientation === "w" ? 7 - y : y;
      const sq = FILES[f] + (r + 1);
      const light = (f + r) % 2 === 1;
      cells.push(<rect key={sq} x={x} y={y} width={1} height={1} fill={light ? theme.light : theme.dark} />);
      if (highlight.includes(sq)) cells.push(<rect key={sq + "h"} x={x} y={y} width={1} height={1} fill={theme.highlight} />);
    }
  return (
    <svg viewBox="0 0 8 8" className={`aspect-square w-full rounded-[3px] ${className}`}>
      {cells}
      {Object.entries(placement).map(([sq, code]) => {
        const { x, y } = pos(sq);
        return <image key={sq} href={PIECE_URL[code as PieceCode]} x={x} y={y} width={1} height={1} />;
      })}
      {arrows.map((a, i) => {
        const p = pos(a.from);
        const q = pos(a.to);
        const [x1, y1, x2, y2] = [p.x + 0.5, p.y + 0.5, q.x + 0.5, q.y + 0.5];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;
        const ex = x2 - ux * 0.4;
        const ey = y2 - uy * 0.4;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={a.color} strokeWidth={0.17} strokeLinecap="round" />
            <polygon points={`${x2},${y2} ${ex - uy * 0.26},${ey + ux * 0.26} ${ex + uy * 0.26},${ey - ux * 0.26}`} fill={a.color} />
          </g>
        );
      })}
    </svg>
  );
}
