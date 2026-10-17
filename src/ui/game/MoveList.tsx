import { useEffect, useRef } from "react";
import { scrollWithin } from "@/ui/scroll";

/** Compact move list for a game in progress. `current` = index of the shown move (-1 = start). */
export function MoveList({ sans, current, onSelect, startPly = 0 }: { sans: string[]; current: number; onSelect?: (i: number) => void; startPly?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollWithin(ref.current, ref.current?.querySelector("[data-current='true']"));
  }, [current, sans.length]);

  const rows: { n: number; w?: number; b?: number }[] = [];
  sans.forEach((_, i) => {
    const ply = startPly + i;
    const n = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0 || !rows.length) rows.push({ n });
    const row = rows[rows.length - 1];
    if (ply % 2 === 0) row.w = i;
    else row.b = i;
  });

  const cell = (i?: number) =>
    i === undefined ? (
      <span className="px-2 py-1 text-text-muted">…</span>
    ) : (
      <button
        data-current={i === current}
        onClick={() => onSelect?.(i)}
        className={`rounded px-2 py-1 text-left font-medium ${i === current ? "bg-accent/20 text-text-primary" : "hover:bg-surface-hover"}`}
      >
        {sans[i]}
      </button>
    );

  return (
    <div ref={ref} className="no-scrollbar max-h-64 overflow-y-auto font-mono text-sm lg:max-h-[50vh]">
      {rows.length === 0 && <p className="p-2 text-sm muted">No moves yet.</p>}
      <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-1">
        {rows.map((r) => (
          <div key={r.n} className="contents">
            <span className="py-1 text-right text-text-muted">{r.n}.</span>
            {cell(r.w)}
            {cell(r.b)}
          </div>
        ))}
      </div>
    </div>
  );
}
