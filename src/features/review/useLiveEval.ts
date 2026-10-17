import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { sharedEngine } from "@/core/engine/engine";
import type { Analysis } from "@/core/engine/uci";

/** Live, progressively deeper engine lines for the shown position. */
export function useLiveEval(fen: string, enabled: boolean, multipv = 3, depth = 18) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  useEffect(() => {
    setAnalysis(null);
    if (!enabled) return;
    try {
      const c = new Chess(fen);
      if (c.isGameOver()) return;
    } catch {
      return;
    }
    let last = 0;
    // Small delay so fast navigation (holding an arrow key) does not start a search per step.
    const timer = setTimeout(() => {
      const j = sharedEngine().analyse(
        fen,
        {
          depth,
          multipv,
          onUpdate: (a) => {
            const now = Date.now();
            if (now - last > 150) {
              last = now;
              setAnalysis(a);
            }
          },
        },
        true
      );
      job = j;
      j.promise.then(setAnalysis).catch(() => undefined);
    }, 120);
    let job: { cancel: () => void } | null = null;
    return () => {
      clearTimeout(timer);
      job?.cancel();
    };
  }, [fen, enabled, multipv, depth]);
  return analysis;
}

export function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const out: string[] = [];
  try {
    const c = new Chess(fen);
    for (const uci of pv.slice(0, max)) {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push(m.san);
    }
  } catch {
    /* stop at an illegal move */
  }
  return out;
}
