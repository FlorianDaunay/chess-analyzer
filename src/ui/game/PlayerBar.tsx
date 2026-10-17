import { useEffect, useState, type ReactNode } from "react";
import type { Color } from "@/core/chess/rules";
import { materialOf } from "@/core/chess/material";
import { PIECE_URL, type PieceCode } from "@/ui/board/pieces";

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  if (total < 10_000) return `${m}:${String(s % 60).padStart(2, "0")}.${Math.floor((total % 1000) / 100)}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Re-renders every `ms` while `active`. */
export function useTicker(active: boolean, ms = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return active ? now : Date.now();
}

export function Clock({ ms, running, low }: { ms: number; running: boolean; low?: boolean }) {
  return (
    <div
      className={`rounded-control px-3 py-1 font-mono text-lg font-semibold tabular-nums transition-colors ${
        running ? (low ? "bg-danger text-white" : "bg-accent text-accent-foreground") : "bg-surface-hover text-text-secondary"
      }`}
    >
      {formatClock(ms)}
    </div>
  );
}

export function Captured({ fen, color }: { fen: string; color: Color }) {
  const info = materialOf(fen);
  const list = info.captured[color];
  const adv = color === "w" ? info.diff : -info.diff;
  const victim = color === "w" ? "b" : "w";
  return (
    <div className="flex min-h-[18px] items-center">
      {list.map((t, i) => (
        <img key={i} src={PIECE_URL[(victim + t.toUpperCase()) as PieceCode]} alt="" className="-ml-1 h-[18px] w-[18px] first:ml-0" />
      ))}
      {adv > 0 && <span className="ml-1 text-xs font-semibold text-text-muted">+{adv}</span>}
    </div>
  );
}

export function PlayerBar({
  name,
  avatar,
  color,
  fen,
  clockMs,
  running,
  active,
  extra,
}: {
  name: string;
  avatar?: ReactNode;
  color: Color;
  fen: string;
  clockMs: number | null;
  running: boolean;
  active: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-tile ${color === "w" ? "bg-[#f3f1ec]" : "bg-[#35332f]"}`}>
          {avatar ?? <span className={`h-4 w-4 rounded-full ${color === "w" ? "bg-white ring-1 ring-black/30" : "bg-black ring-1 ring-white/30"}`} />}
        </div>
        <div className="min-w-0">
          <div className={`truncate text-sm font-semibold ${active ? "text-text-primary" : "text-text-secondary"}`}>
            {name}
            {active && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-success align-middle" />}
          </div>
          <Captured fen={fen} color={color} />
        </div>
        {extra}
      </div>
      {clockMs !== null && <Clock ms={clockMs} running={running} low={clockMs < 20_000} />}
    </div>
  );
}
