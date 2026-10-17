import { useSettings } from "@/store/settings";

let ctx: AudioContext | null = null;

/** Tiny synthesized sounds (no audio files to download). */
function tone(freq: number, duration: number, type: OscillatorType = "triangle", gain = 0.08, when = 0) {
  if (!useSettings.getState().sound) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    /* audio not available */
  }
}

export const sounds = {
  move: () => tone(420, 0.07, "square", 0.04),
  capture: () => {
    tone(260, 0.09, "square", 0.06);
    tone(180, 0.08, "triangle", 0.05, 0.03);
  },
  check: () => tone(880, 0.15, "sine", 0.06),
  end: () => {
    tone(523, 0.18, "sine", 0.07);
    tone(659, 0.18, "sine", 0.07, 0.15);
    tone(784, 0.3, "sine", 0.07, 0.3);
  },
  success: () => {
    tone(660, 0.1, "sine", 0.07);
    tone(990, 0.2, "sine", 0.07, 0.09);
  },
  fail: () => tone(200, 0.25, "sawtooth", 0.04),
};

export function playMoveSound(san: string | undefined) {
  if (!san) return;
  if (san.includes("#")) sounds.end();
  else if (san.includes("+")) sounds.check();
  else if (san.includes("x")) sounds.capture();
  else sounds.move();
}
