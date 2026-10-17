import { scorePct, total, type Stats } from "@/core/analysis/stats";
import { HOW_LABEL } from "@/core/chesscom/api";

/** Plain-language observations Hoot tells the player. Most important first. */
export function insights(s: Stats): string[] {
  const out: string[] = [];
  if (!s.games) return out;
  const w = scorePct(s.byColor.w);
  const b = scorePct(s.byColor.b);
  if (total(s.byColor.w) >= 5 && total(s.byColor.b) >= 5 && Math.abs(w - b) >= 8)
    out.push(`You score ${Math.round(Math.max(w, b))}% with ${w > b ? "White" : "Black"} but only ${Math.round(Math.min(w, b))}% with ${w > b ? "Black" : "White"}.`);

  const openings = s.openings.filter((o) => o.games >= 4);
  const best = [...openings].sort((x, y) => scorePct(y.wdl) - scorePct(x.wdl))[0];
  const worst = [...openings].sort((x, y) => scorePct(x.wdl) - scorePct(y.wdl))[0];
  if (best) out.push(`Best opening: ${best.name} as ${best.color === "w" ? "White" : "Black"} (${Math.round(scorePct(best.wdl))}% in ${best.games} games).`);
  if (worst && worst !== best && scorePct(worst.wdl) < 45)
    out.push(`Trouble spot: ${worst.name} as ${worst.color === "w" ? "White" : "Black"} — ${Math.round(scorePct(worst.wdl))}% in ${worst.games} games. Worth a look in the Openings tab.`);

  const losses = Object.entries(s.lossesBy).sort((a, b) => b[1] - a[1]);
  const lossTotal = losses.reduce((a, [, n]) => a + n, 0);
  if (losses[0] && lossTotal >= 5 && losses[0][1] / lossTotal >= 0.35)
    out.push(`${Math.round((losses[0][1] / lossTotal) * 100)}% of your losses are by ${HOW_LABEL[losses[0][0]]?.toLowerCase() ?? losses[0][0]}${losses[0][0] === "timeout" ? " — watch the clock!" : "."}`);

  const e = s.engine;
  if (e) {
    out.push(`Average accuracy ${e.accuracy.toFixed(1)}% over ${e.analyzed} analyzed games (opponents: ${e.opponentAccuracy.toFixed(1)}%).`);
    const bl = e.perGame.blunder ?? 0;
    if (bl >= 0.3) out.push(`You make about ${bl.toFixed(1)} blunder${bl >= 1.5 ? "s" : ""} per game. The Train tab turns them into exercises.`);
    const phases = Object.entries(e.phaseAccuracy).sort((a, b) => a[1]! - b[1]!);
    if (phases.length >= 2 && phases[phases.length - 1][1]! - phases[0][1]! >= 5) out.push(`Your weakest phase is the ${phases[0][0]} (${phases[0][1]!.toFixed(0)}% accuracy vs ${phases[phases.length - 1][1]!.toFixed(0)}% in the ${phases[phases.length - 1][0]}).`);
    const tt = e.timeTroubleBlunders;
    if (tt.blunders >= 3 && tt.inTimeTrouble / tt.blunders >= 0.35) out.push(`${Math.round((tt.inTimeTrouble / tt.blunders) * 100)}% of your blunders happen with less than 10% of your time left.`);
  }

  const diff = s.byRatingDiff.find((d) => d.label === "> +200");
  if (diff && total(diff.wdl) >= 5 && scorePct(diff.wdl) >= 35) out.push(`Giant killer: you score ${Math.round(scorePct(diff.wdl))}% against players rated 200+ above you.`);
  if (s.currentStreak && s.currentStreak.length >= 3)
    out.push(s.currentStreak.outcome === "win" ? `You're on ${[8, 11, 18].includes(s.currentStreak.length) ? "an" : "a"} ${s.currentStreak.length}-game winning streak!` : s.currentStreak.outcome === "loss" ? `${s.currentStreak.length} losses in a row. Maybe take a break or play a slower game?` : `${s.currentStreak.length} draws in a row!`);
  return out;
}
