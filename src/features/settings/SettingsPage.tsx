import { themes, themeToStyle, useActiveTheme, useThemeStore } from "@/themes";
import { useSettings } from "@/store/settings";
import { BOARD_THEMES } from "@/ui/palette";
import { Toggle } from "@/ui/game/RulesEditor";

export default function SettingsPage() {
  const s = useSettings();
  const active = useActiveTheme();
  const { followSystem, selectTheme, setFollowSystem } = useThemeStore();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1>Settings</h1>
      <div className="card grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Your name (online games)</span>
          <input className="input" value={s.playerName} maxLength={24} onChange={(e) => s.set({ playerName: e.target.value })} placeholder="Player" />
        </label>
        <div className="flex flex-wrap content-end gap-4">
          <Toggle label="Sounds" checked={s.sound} onChange={(sound) => s.set({ sound })} />
          <Toggle label="Animations" checked={s.animations} onChange={(animations) => s.set({ animations })} />
          <Toggle label="Coordinates" checked={s.coordinates} onChange={(coordinates) => s.set({ coordinates })} />
          <Toggle label="Show legal moves" checked={s.showLegal} onChange={(showLegal) => s.set({ showLegal })} />
          <Toggle label="Hoot the guide" checked={s.mascotGuide} onChange={(mascotGuide) => s.set({ mascotGuide })} />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3">Board</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {BOARD_THEMES.map((b) => (
            <button key={b.id} onClick={() => s.set({ boardTheme: b.id })} className={`rounded-tile p-1.5 ${s.boardTheme === b.id ? "ring-2 ring-accent" : "hover:bg-surface-hover"}`}>
              <div className="grid aspect-square grid-cols-4 overflow-hidden rounded">
                {Array.from({ length: 16 }, (_, i) => (
                  <div key={i} style={{ background: (Math.floor(i / 4) + i) % 2 ? b.dark : b.light }} />
                ))}
              </div>
              <div className="mt-1 text-xs font-medium">{b.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2>Theme · {active.name}</h2>
          <Toggle label="Follow system light/dark" checked={followSystem} onChange={setFollowSystem} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTheme(t.id)}
              style={themeToStyle(t)}
              className={`overflow-hidden rounded-card border border-border bg-canvas p-2 text-left ${active.id === t.id ? "ring-2 ring-accent" : ""}`}
            >
              <div className="rounded-control border border-border bg-surface p-2">
                <div className="mb-1 h-2 w-2/3 rounded-pill bg-text-primary/80" />
                <div className="mb-2 h-2 w-1/2 rounded-pill bg-text-muted/60" />
                <div className="flex gap-1">
                  <span className="h-3 w-6 rounded-pill bg-accent" />
                  <span className="h-3 w-3 rounded-pill bg-success" />
                  <span className="h-3 w-3 rounded-pill bg-danger" />
                </div>
              </div>
              <div className="mt-1.5 truncate text-xs font-semibold text-text-primary">{t.name}</div>
            </button>
          ))}
        </div>
      </div>
      <p className="text-center text-xs muted">
        Engine: Stockfish 17.1 (GPLv3) · Pieces: cburnett (lichess) · Openings: lichess chess-openings (CC0) · Game data: chess.com public API
      </p>
    </div>
  );
}
