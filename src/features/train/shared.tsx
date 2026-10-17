import type { ReactNode } from "react";
import { Icon } from "@/ui/icons";
import { Mascot, type Mood } from "@/ui/mascot/Mascot";
import { useTrain } from "./trainStore";

export interface Feedback {
  text: string;
  mood: Mood;
  tone?: "good" | "bad" | "info";
}

/** Common frame of an exercise: title, back, mascot feedback, board on the left and controls on the right. */
export function TrainShell({ title, subtitle, onBack, board, feedback, children, progress }: { title: string; subtitle?: string; onBack: () => void; board: ReactNode; feedback: Feedback | null; children?: ReactNode; progress?: string }) {
  const { xp, streak } = useTrain();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-icon btn" onClick={onBack} aria-label="Back to exercises">
          <Icon name="back" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl">{title}</h1>
          {subtitle && <p className="truncate text-xs muted">{subtitle}</p>}
        </div>
        {progress && <span className="badge">{progress}</span>}
        <span className="badge">⭐ {xp} XP</span>
        <span className="badge">🔥 {streak}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-240px))] lg:max-w-[calc(100dvh-170px)]">{board}</div>
        <div className="flex flex-col gap-3">
          <div className="card flex items-start gap-3 p-3">
            <Mascot size={56} mood={feedback?.mood ?? "idle"} className="shrink-0" />
            <p
              key={feedback?.text}
              className={`animate-pop text-sm ${feedback?.tone === "good" ? "font-semibold text-success" : feedback?.tone === "bad" ? "font-semibold text-danger" : ""}`}
            >
              {feedback?.text ?? "…"}
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export const turnText = (c: "w" | "b") => (c === "w" ? "White" : "Black");
