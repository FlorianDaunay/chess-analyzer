import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PERSONAS } from "@/core/ai/personas";
import { useSettings } from "@/store/settings";
import { Icon, type IconName } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";

const FEATURES: { to: string; icon: IconName; title: string; text: string }[] = [
  { to: "/analyze", icon: "chart", title: "Analyze your games", text: "Import a chess.com account: accuracy, best and worst moves, openings, graphs." },
  { to: "/train", icon: "target", title: "Train", text: "Exercises built from your own mistakes, plus openings, endgames and board vision." },
  { to: "/play", icon: "play", title: "Play the mascot", text: "Seven owls from 400 to 3000 Elo, with hints and takebacks if you want." },
  { to: "/online", icon: "users", title: "Play a friend", text: "Same device or online with a room code. Peer-to-peer, no account." },
  { to: "/tournament", icon: "trophy", title: "Tournaments", text: "Round robin, Swiss or knockout between friends, all peer-to-peer." },
  { to: "/board", icon: "grid", title: "Free board", text: "Set up any position, then analyze it or play it out." },
];

export function HomePage() {
  const navigate = useNavigate();
  const saved = useSettings((s) => s.chessComUser);
  const [user, setUser] = useState(saved);

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-5 sm:p-8">
        <div className="relative z-10 max-w-xl space-y-4">
          <h1 className="text-3xl sm:text-4xl">Your chess, analyzed. Your mistakes, trained.</h1>
          <p className="text-text-secondary">
            Chess Lab reads your public chess.com games, runs Stockfish right in your browser and turns what it finds into stats, replays and exercises.
          </p>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (user.trim()) navigate(`/analyze?user=${encodeURIComponent(user.trim())}`);
            }}
          >
            <input className="input sm:max-w-xs" placeholder="chess.com username" value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="off" autoCorrect="off" />
            <button className="btn-primary" type="submit">
              <Icon name="search" /> Analyze
            </button>
          </form>
        </div>
        <div className="pointer-events-none absolute -bottom-3 right-2 hidden opacity-95 sm:block">
          <Mascot size={150} mood="happy" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Link key={f.to} to={f.to} className="card group flex gap-3 transition-all hover:-translate-y-0.5 hover:shadow-overlay">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-accent/15 text-accent">
              <Icon name={f.icon} size={22} />
            </div>
            <div>
              <h2 className="text-base">{f.title}</h2>
              <p className="text-sm text-text-secondary">{f.text}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2>Meet the owls</h2>
          <Link to="/play" className="text-sm font-semibold text-accent">
            Play →
          </Link>
        </div>
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {PERSONAS.map((p) => (
            <Link to="/play" key={p.id} onClick={() => import("@/features/play/playStore").then((m) => m.usePlay.getState().setSetup({ mode: "mascot", personaId: p.id }))} className="flex w-24 shrink-0 flex-col items-center rounded-card p-2 text-center hover:bg-surface-hover">
              <Mascot persona={p} size={60} />
              <span className="mt-1 text-sm font-semibold">{p.name}</span>
              <span className="text-xs muted">{p.elo}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
