import { useState } from "react";
import { Chess } from "chess.js";
import { CLOCK_PRESETS, START_MODES, VARIANTS, describeClock, type ClockRules, type Rules } from "@/core/chess/rules";

export function fenError(fen: string): string | null {
  try {
    new Chess(fen);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^Invalid FEN: /, "") : "Invalid FEN";
  }
}

/** Edit every rule of a match. `hide` removes options that make no sense in a context (e.g. hints online). */
export function RulesEditor({ rules, onChange, hide = [], disabled }: { rules: Rules; onChange: (r: Rules) => void; hide?: (keyof Rules)[]; disabled?: boolean }) {
  const [custom, setCustom] = useState(false);
  const set = (patch: Partial<Rules>) => onChange({ ...rules, ...patch });
  const setClock = (patch: Partial<ClockRules>) => set({ clock: { ...(rules.clock ?? { whiteMs: 300_000, blackMs: 300_000, incrementMs: 0 }), ...patch } });
  const presetLabel = CLOCK_PRESETS.find((p) => describeClock(p.clock) === describeClock(rules.clock))?.label;
  const fenProblem = rules.start === "fen" ? fenError(rules.fen ?? "") : null;

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div>
        <span className="label">Time control</span>
        <div className="flex flex-wrap gap-1.5">
          {CLOCK_PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className={presetLabel === p.label && !custom ? "chip-active" : "chip"}
              onClick={() => {
                setCustom(false);
                set({ clock: p.clock });
              }}
            >
              {p.label}
            </button>
          ))}
          <button type="button" className={custom || (!presetLabel && rules.clock) ? "chip-active" : "chip"} onClick={() => setCustom(true)}>
            Custom
          </button>
        </div>
        {(custom || (!presetLabel && rules.clock)) && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <NumberField label="White (min)" value={(rules.clock?.whiteMs ?? 300_000) / 60_000} min={0.25} step={0.25} onChange={(v) => setClock({ whiteMs: v * 60_000 })} />
            <NumberField label="Black (min)" value={(rules.clock?.blackMs ?? 300_000) / 60_000} min={0.25} step={0.25} onChange={(v) => setClock({ blackMs: v * 60_000 })} />
            <NumberField label="Increment (s)" value={(rules.clock?.incrementMs ?? 0) / 1000} min={0} step={1} onChange={(v) => setClock({ incrementMs: v * 1000 })} />
            <p className="col-span-3 text-xs muted">Different times for White and Black = time odds handicap.</p>
          </div>
        )}
      </div>

      {!hide.includes("variant") && (
        <div>
          <span className="label">Variant</span>
          <div className="flex flex-wrap gap-1.5">
            {VARIANTS.map((v) => (
              <button type="button" key={v.id} title={v.description} className={rules.variant === v.id ? "chip-active" : "chip"} onClick={() => set({ variant: v.id })}>
                {v.name}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs muted">{VARIANTS.find((v) => v.id === rules.variant)?.description}</p>
        </div>
      )}

      {!hide.includes("start") && (
        <div>
          <span className="label">Starting position</span>
          <div className="flex flex-wrap gap-1.5">
            {START_MODES.map((s) => (
              <button
                type="button"
                key={s.id}
                className={rules.start === s.id ? "chip-active" : "chip"}
                onClick={() => set({ start: s.id, shuffleSeed: s.id === "shuffle" ? rules.shuffleSeed ?? Math.floor(Math.random() * 1e9) : rules.shuffleSeed })}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs muted">{START_MODES.find((s) => s.id === rules.start)?.description}</p>
          {rules.start === "shuffle" && (
            <button type="button" className="btn-sm btn mt-2" onClick={() => set({ shuffleSeed: Math.floor(Math.random() * 1e9) })}>
              New random position
            </button>
          )}
          {rules.start === "fen" && (
            <div className="mt-2">
              <input className="input font-mono text-xs" value={rules.fen ?? ""} placeholder="FEN, e.g. 8/8/8/4k3/8/8/4P3/4K3 w - - 0 1" onChange={(e) => set({ fen: e.target.value.trim() })} />
              {fenProblem && <p className="mt-1 text-xs text-danger">{fenProblem}</p>}
              <p className="mt-1 text-xs muted">Tip: set up the position on the Free board, then use "Play from here".</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        {!hide.includes("takebacks") && <Toggle label="Takebacks" checked={rules.takebacks} onChange={(v) => set({ takebacks: v })} />}
        {!hide.includes("hints") && <Toggle label="Hints" checked={rules.hints} onChange={(v) => set({ hints: v })} />}
      </div>
    </fieldset>
  );
}

export function rulesValid(rules: Rules): boolean {
  return rules.start !== "fen" || !fenError(rules.fen ?? "");
}

function NumberField({ label, value, min, step, onChange }: { label: string; value: number; min: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="number"
        className="input"
        value={value}
        min={min}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min) onChange(v);
        }}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-pill transition-colors ${checked ? "bg-accent" : "bg-surface-hover border border-border"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      {label}
    </label>
  );
}
