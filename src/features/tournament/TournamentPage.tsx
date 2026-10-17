import { useEffect, useMemo, useState } from "react";
import { playerName, type RoomSnapshot } from "@/core/room/room";
import { FORMATS, standings, isFinished } from "@/core/room/tournament";
import { describeRules } from "@/core/chess/rules";
import { useRoom } from "@/net/roomStore";
import { Icon } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";
import { MiniBoard } from "@/ui/board/MiniBoard";
import { RulesEditor } from "@/ui/game/RulesEditor";
import { currentFen } from "@/core/chess/game";
import { Chat, CreateJoin, Players, RoomGameView, RoomHeader } from "@/features/online/RoomUI";

export default function TournamentPage() {
  const { room, resume, status } = useRoom();
  useEffect(() => {
    void resume();
  }, [resume]);
  if (room && room.settings.kind === "match")
    return (
      <div className="card text-sm">
        You are in a match room. <a className="font-semibold text-accent" href="#/online">Open it →</a>
      </div>
    );
  return (
    <div className="space-y-4">
      <h1>Tournament</h1>
      {!room || status === "idle" ? <CreateJoin kind="tournament" /> : <TournamentRoom room={room} />}
    </div>
  );
}

const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function TournamentRoom({ room }: { room: RoomSnapshot }) {
  const { myId, send } = useRoom();
  const isHost = room.hostId === myId;
  const t = room.tournament;
  const [watching, setWatching] = useState<string | null>(null);
  const players = room.lobby.filter((p) => !p.spectator);
  const table = useMemo(() => (t ? standings(t, players.map((p) => p.id)) : []), [t, players]);
  const format = FORMATS.find((f) => f.id === room.settings.format)!;

  // My game in the current round (if still playing), else what I chose to watch.
  const myGame = t
    ? Object.values(room.games)
        .filter((g) => g.round === t.round && (g.white === myId || g.black === myId))
        .sort((a, b) => b.id.localeCompare(a.id))[0]
    : undefined;
  const shown = (watching && room.games[watching]) || (myGame && !myGame.state.result ? myGame : undefined) || myGame;
  useEffect(() => setWatching(null), [t?.round]);

  if (room.phase === "lobby")
    return (
      <div className="space-y-4">
        <RoomHeader room={room} />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <Mascot size={56} persona={{ name: "Grand Owl", body: "#7a4a9a", belly: "#ecdcf6", accessory: "crown" }} mood="talking" />
              <div className="text-sm">
                <p className="font-semibold">
                  {format.name} · {describeRules(room.settings.rules)}
                </p>
                <p className="muted">{format.description}</p>
                <p className="mt-1">{players.length < 2 ? "Waiting for players… share the code!" : `${players.length} players ready.`}</p>
              </div>
            </div>
            {isHost && (
              <>
                <div>
                  <span className="label">Format</span>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMATS.map((f) => (
                      <button key={f.id} className={room.settings.format === f.id ? "chip-active" : "chip"} onClick={() => send({ t: "settings", settings: { format: f.id } })}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                  {room.settings.format === "swiss" && (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      Rounds
                      <input type="number" min={1} max={15} className="input w-20" value={room.settings.swissRounds} onChange={(e) => send({ t: "settings", settings: { swissRounds: Math.max(1, Math.min(15, Number(e.target.value) || 1)) } })} />
                    </label>
                  )}
                </div>
                <RulesEditor rules={room.settings.rules} onChange={(rules) => send({ t: "settings", settings: { rules } })} hide={["hints"]} />
                <button className="btn-primary w-full py-3" disabled={players.length < 2} onClick={() => send({ t: "start" })}>
                  <Icon name="trophy" /> Start the tournament
                </button>
              </>
            )}
          </div>
          <div className="space-y-3">
            <Players room={room} />
            <Chat room={room} />
          </div>
        </div>
      </div>
    );

  const roundDone = !!t && t.pairings.filter((p) => p.round === t.round).every((p) => p.result);
  const over = room.phase === "finished";
  const winner = over ? table[0] : null;

  return (
    <div className="space-y-4">
      <RoomHeader room={room} />
      {over && winner && (
        <div className="card flex items-center gap-4">
          <Mascot size={80} persona={{ name: "Grand Owl", body: "#7a4a9a", belly: "#ecdcf6", accessory: "crown" }} mood="happy" />
          <div>
            <p className="text-xs uppercase tracking-wide muted">Tournament winner</p>
            <p className="text-2xl font-extrabold">🏆 {playerName(room, winner.id)}</p>
            <p className="text-sm muted">
              {fmtPts(winner.points)} points
              {table[1] && ` · 2nd ${playerName(room, table[1].id)}`}
              {table[2] && ` · 3rd ${playerName(room, table[2].id)}`}
            </p>
          </div>
        </div>
      )}
      {t && !over && (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <span className="font-semibold">
            Round {t.round}
            {room.settings.format !== "knockout" && ` / ${t.totalRounds}`}
          </span>
          <span className="text-sm muted">{format.name}</span>
          {roundDone ? (
            isHost ? (
              <button className="btn-primary ml-auto" onClick={() => send({ t: "nextRound" })}>
                {isFinished(t) ? "Finish tournament" : "Start next round"} <Icon name="forward" />
              </button>
            ) : (
              <span className="ml-auto text-sm muted">Round over · waiting for the host</span>
            )
          ) : (
            <span className="ml-auto text-sm muted">{t.pairings.filter((p) => p.round === t.round && !p.result).length} games in progress</span>
          )}
        </div>
      )}

      {shown && !over ? (
        <RoomGameView room={room} game={shown} side={<Side room={room} table={table} onWatch={setWatching} watching={shown.id} />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="card">
            {!over && (
              <p className="mb-3 flex items-center gap-2 text-sm">
                <Mascot size={36} mood="idle" />
                {myGame ? "Your game is over for this round." : "You have a bye this round (1 point)."} Watch the others below.
              </p>
            )}
            <Standings room={room} table={table} />
          </div>
          <Side room={room} table={table} onWatch={setWatching} watching={null} hideStandings />
        </div>
      )}
    </div>
  );
}

function Standings({ room, table }: { room: RoomSnapshot; table: ReturnType<typeof standings> }) {
  const ko = room.settings.format === "knockout";
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs muted">
          <th className="py-1">#</th>
          <th>Player</th>
          <th className="text-right">Pts</th>
          <th className="text-right">W/D/L</th>
          {!ko && <th className="text-right">{room.settings.format === "swiss" ? "Buch." : "SB"}</th>}
        </tr>
      </thead>
      <tbody>
        {table.map((s, i) => (
          <tr key={s.id} className={`border-t border-border ${s.eliminated ? "opacity-50" : ""}`}>
            <td className="py-1.5">{i + 1}</td>
            <td className="truncate font-medium">
              {playerName(room, s.id)}
              {s.eliminated && <span className="ml-1 text-xs muted">out</span>}
            </td>
            <td className="text-right font-bold tabular-nums">{fmtPts(s.points)}</td>
            <td className="text-right tabular-nums muted">
              {s.wins}/{s.draws}/{s.losses}
            </td>
            {!ko && <td className="text-right tabular-nums muted">{fmtPts(s.tiebreak)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Side({ room, table, onWatch, watching, hideStandings }: { room: RoomSnapshot; table: ReturnType<typeof standings>; onWatch: (id: string) => void; watching: string | null; hideStandings?: boolean }) {
  const t = room.tournament!;
  const [round, setRound] = useState(t.round);
  useEffect(() => setRound(t.round), [t.round]);
  const pairings = t.pairings.filter((p) => p.round === round);
  return (
    <div className="space-y-3">
      {!hideStandings && (
        <div className="card p-3">
          <h2 className="mb-1 text-base">Standings</h2>
          <Standings room={room} table={table} />
        </div>
      )}
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base">Round {round}</h2>
          <div className="flex gap-1">
            <button className="btn-sm btn" disabled={round <= 1} onClick={() => setRound((r) => r - 1)}>
              <Icon name="back" size={14} />
            </button>
            <button className="btn-sm btn" disabled={round >= t.round} onClick={() => setRound((r) => r + 1)}>
              <Icon name="forward" size={14} />
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {pairings.map((p) => {
            const gid = p.gameIds[p.gameIds.length - 1];
            const g = gid ? room.games[gid] : undefined;
            return (
              <button key={p.id} disabled={!g} onClick={() => g && onWatch(g.id)} className={`flex w-full items-center gap-2 rounded-tile p-1.5 text-left text-sm hover:bg-surface-hover ${watching === gid ? "bg-accent/10" : ""}`}>
                {g && (
                  <div className="w-12 shrink-0">
                    <MiniBoard fen={currentFen(g.state)} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    ⚪ {playerName(room, p.white)} {p.result ? <b>{fmtPts(p.result.w)}</b> : ""}
                  </div>
                  <div className="truncate">{p.black ? <>⚫ {playerName(room, p.black)} {p.result ? <b>{fmtPts(p.result.b)}</b> : ""}</> : <span className="muted">bye</span>}</div>
                  {p.gameIds.length > 1 && <div className="text-xs muted">game {p.gameIds.length} (tiebreak)</div>}
                </div>
                {g && !g.state.result && <span className="h-2 w-2 rounded-full bg-success" title="in progress" />}
              </button>
            );
          })}
        </div>
      </div>
      <Players room={room} />
      <Chat room={room} />
    </div>
  );
}
