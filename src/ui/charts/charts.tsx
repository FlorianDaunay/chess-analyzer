import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RESULT_COLORS } from "@/ui/palette";
import { scorePct, total, type WDL } from "@/core/analysis/stats";

/** Categorical series colours (validated order: blue, orange, aqua, yellow). Always shown with a legend. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

const INK = "rgb(var(--color-text-muted))";
const INK2 = "rgb(var(--color-text-secondary))";
const GRID = "rgb(var(--color-border))";
const SURFACE = "rgb(var(--color-surface))";

/** Width of an element, following resizes. The element may mount after the first render. */
export function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const callback = useCallback((node: T | null) => setEl(node), []);
  return [callback, width, el] as const;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), width - 170);
  return (
    <div className="pointer-events-none absolute z-10 min-w-[120px] rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs shadow-overlay" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const fmtMonth = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const fmtShort = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export interface Series {
  name: string;
  color: string;
  points: { x: number; y: number; id?: string }[];
}

/** Time series lines (rating history, accuracy trend). Crosshair + tooltip on hover. */
export function LineChart({ series, height = 220, yLabel, onPointClick, yDomain }: { series: Series[]; height?: number; yLabel?: string; onPointClick?: (id: string) => void; yDomain?: [number, number] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <p className="py-8 text-center text-sm muted">No data.</p>;
  const pad = { l: 40, r: 12, t: 10, b: 24 };
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [ymin, ymax] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  const yPad = yDomain ? 0 : Math.max(10, (ymax - ymin) * 0.08);
  const y0 = ymin - yPad;
  const y1 = ymax + yPad;
  const w = Math.max(10, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const sx = (x: number) => pad.l + (x1 === x0 ? w / 2 : ((x - x0) / (x1 - x0)) * w);
  const sy = (y: number) => pad.t + h - ((y - y0) / (y1 - y0 || 1)) * h;
  const yTicks = niceTicks(y0, y1, 4);
  const xTicks = niceTicks(x0, x1, Math.max(2, Math.floor(w / 110)));

  // Hover: nearest x across series.
  const hx = hover !== null ? x0 + ((hover - pad.l) / w) * (x1 - x0) : null;
  const nearest =
    hx !== null
      ? series
          .map((s) => {
            const p = s.points.reduce<(typeof s.points)[number] | null>((best, q) => (!best || Math.abs(q.x - hx) < Math.abs(best.x - hx) ? q : best), null);
            return p ? { s, p } : null;
          })
          .filter((v): v is NonNullable<typeof v> => !!v)
      : [];
  const anchor = nearest[0]?.p;

  return (
    <div ref={ref} className="relative w-full select-none">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onPointerMove={(e) => setHover(e.clientX - e.currentTarget.getBoundingClientRect().left)}
          onPointerLeave={() => setHover(null)}
          onClick={() => anchor?.id && onPointClick?.(anchor.id)}
          className={onPointClick ? "cursor-pointer" : ""}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + w} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={INK}>
                {Math.round(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={height - 6} textAnchor="middle" fontSize={10} fill={INK}>
              {x1 - x0 < 60 * 86_400_000 ? fmtShort(t) : fmtMonth(t)}
            </text>
          ))}
          {yLabel && (
            <text x={4} y={pad.t} fontSize={10} fill={INK}>
              {yLabel}
            </text>
          )}
          {series.map((s) => (
            <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} />
          ))}
          {series.map((s) => {
            const last = s.points[s.points.length - 1];
            return <circle key={s.name + "end"} cx={sx(last.x)} cy={sy(last.y)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />;
          })}
          {anchor && (
            <>
              <line x1={sx(anchor.x)} x2={sx(anchor.x)} y1={pad.t} y2={pad.t + h} stroke={INK2} strokeWidth={1} />
              {nearest.map(({ s, p }) => (
                <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r={5} fill={s.color} stroke={SURFACE} strokeWidth={2} />
              ))}
            </>
          )}
        </svg>
      )}
      {anchor && hover !== null && (
        <Tooltip x={sx(anchor.x)} y={10} width={width}>
          <div className="mb-1 font-semibold">{fmtDay(anchor.x)}</div>
          {nearest.map(({ s, p }) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-text-secondary">{s.name}</span>
              <span className="ml-auto font-semibold tabular-nums">{Math.round(p.y)}</span>
            </div>
          ))}
          {onPointClick && anchor.id && <div className="mt-1 text-[10px] muted">Click to open the game</div>}
        </Tooltip>
      )}
      {series.length > 1 && (
        <div className="mt-1">
          <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
        </div>
      )}
    </div>
  );
}

/** Horizontal win/draw/loss bars, one per row. */
export function WdlBars({ rows, onRowClick }: { rows: { label: ReactNode; key: string; wdl: WDL; extra?: ReactNode }[]; onRowClick?: (key: string) => void }) {
  const [tip, setTip] = useState<{ key: string; x: number; y: number } | null>(null);
  const [ref, width, el] = useWidth<HTMLDivElement>();
  const max = Math.max(1, ...rows.map((r) => total(r.wdl)));
  const active = rows.find((r) => r.key === tip?.key);
  return (
    <div ref={ref} className="relative space-y-1.5">
      {rows.map((r) => {
        const n = total(r.wdl);
        const parts: [keyof WDL, string][] = [
          ["win", RESULT_COLORS.win],
          ["draw", RESULT_COLORS.draw],
          ["loss", RESULT_COLORS.loss],
        ];
        return (
          <div
            key={r.key}
            className={`grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 rounded px-1 text-sm ${onRowClick ? "cursor-pointer hover:bg-surface-hover" : ""}`}
            onClick={() => onRowClick?.(r.key)}
            onPointerMove={(e) => {
              const box = el!.getBoundingClientRect();
              setTip({ key: r.key, x: e.clientX - box.left, y: e.clientY - box.top + 14 });
            }}
            onPointerLeave={() => setTip(null)}
          >
            <span className="truncate text-text-secondary">{r.label}</span>
            <div className="flex h-3.5 gap-[2px]" style={{ width: `${Math.max(4, (n / max) * 100)}%` }}>
              {parts.map(([k, c], i) =>
                r.wdl[k] ? (
                  <div
                    key={k}
                    style={{ flex: r.wdl[k], background: c, borderRadius: i === 0 ? "2px 0 0 2px" : undefined }}
                    className="h-full first:rounded-l-[2px] last:rounded-r-[4px]"
                  />
                ) : null
              )}
            </div>
            <span className="w-24 text-right text-xs tabular-nums text-text-secondary">
              {n} · <b className="text-text-primary">{Math.round(scorePct(r.wdl))}%</b>
              {r.extra}
            </span>
          </div>
        );
      })}
      {active && tip && (
        <Tooltip x={tip.x} y={tip.y} width={width}>
          <div className="mb-0.5 font-semibold">{active.label}</div>
          <div>
            <span style={{ color: "inherit" }}>Wins {active.wdl.win}</span> · Draws {active.wdl.draw} · Losses {active.wdl.loss}
          </div>
          <div className="muted">Score {scorePct(active.wdl).toFixed(1)}%</div>
        </Tooltip>
      )}
    </div>
  );
}

export const WDL_LEGEND = [
  { label: "Win", color: RESULT_COLORS.win },
  { label: "Draw", color: RESULT_COLORS.draw },
  { label: "Loss", color: RESULT_COLORS.loss },
];

/** Vertical columns with a hover tooltip (games by hour, mistakes per game…). */
export function Columns({ data, height = 140, color = SERIES[0], format = (v: number) => String(Math.round(v)), labelEvery = 1 }: { data: { label: string; value: number; tip?: ReactNode }[]; height?: number; color?: string; format?: (v: number) => string; labelEvery?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1e-9, ...data.map((d) => d.value));
  const pad = { b: 18, t: 16 };
  const slot = width / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, slot - 2));
  const h = height - pad.b - pad.t;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} onPointerLeave={() => setHover(null)}>
          <line x1={0} x2={width} y1={pad.t + h} y2={pad.t + h} stroke={GRID} />
          {data.map((d, i) => {
            const bh = (d.value / max) * h;
            const x = i * slot + (slot - bw) / 2;
            const y = pad.t + h - bh;
            const r = Math.min(4, bw / 2, bh);
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
                {bh > 0 && <path d={`M${x},${pad.t + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + h} Z`} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {i % labelEvery === 0 && (
                  <text x={i * slot + slot / 2} y={height - 4} textAnchor="middle" fontSize={10} fill={INK}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={hover * slot + slot / 2} y={0} width={width}>
          <div className="font-semibold">{data[hover].label}</div>
          {data[hover].tip ?? <div>{format(data[hover].value)}</div>}
        </Tooltip>
      )}
    </div>
  );
}

export function StatTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-2 text-2xl font-semibold tabular-nums">
        {accent && <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />}
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-text-secondary">{sub}</div>}
    </div>
  );
}

/** Thin meter 0..100 (accuracy). */
export function Meter({ value, color = SERIES[0] }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-hover">
      <div className="h-full rounded-pill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}
