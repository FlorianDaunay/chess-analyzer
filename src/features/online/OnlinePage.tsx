import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { playerName, type RoomSnapshot } from "@/core/room/room";
import { describeRules } from "@/core/chess/rules";
import { useRoom } from "@/net/roomStore";
import { Icon } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";
import { RulesEditor } from "@/ui/game/RulesEditor";
import { Chat, CreateJoin, Players, RoomGameView, RoomHeader } from "./RoomUI";

export default function OnlinePage() {
  const { room, resume, status } = useRoom();
  const location = useLocation();
  const fen = (location.state as { fen?: string } | null)?.fen;
  useEffect(() => {
    void resume();
  }, [resume]);

  if (room && room.settings.kind === "tournament")
    return (
      <div className="card text-sm">
        You are in a tournament room. <a className="font-semibold text-accent" href="#/tournament">Open it →</a>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1>Play online</h1>
      {!room || status === "idle" ? <CreateJoin kind="match" initialFen={fen} /> : <MatchRoom room={room} />}
    </div>
  );
}

function MatchRoom({ room }: { room: RoomSnapshot }) {
  const { myId, send } = useRoom();
  const isHost = room.hostId === myId;
  const [gameIndex, setGameIndex] = useState<number | null>(null);
  const games = room.matchGames.map((id) => room.games[id]);
  const current = games[gameIndex ?? games.length - 1];
  useEffect(() => setGameIndex(null), [games.length]);

  // Match score across games.
  const scores: Record<string, number> = {};
  for (const g of games) {
    const r = g.state.result;
    if (!r) continue;
    if (r.winner === null) {
      scores[g.white] = (scores[g.white] ?? 0) + 0.5;
      scores[g.black] = (scores[g.black] ?? 0) + 0.5;
    } else {
      const w = r.winner === "w" ? g.white : g.black;
      scores[w] = (scores[w] ?? 0) + 1;
    }
  }
  const scoreText = Object.fromEntries(room.lobby.filter((p) => !p.spectator).map((p) => [p.id, String(scores[p.id] ?? 0)]));
  const players = room.lobby.filter((p) => !p.spectator);

  if (room.phase === "lobby")
    return (
      <div className="space-y-4">
        <RoomHeader room={room} />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <Mascot size={56} mood={players.length >= 2 ? "happy" : "thinking"} />
              <p className="text-sm">
                {players.length < 2 ? "Waiting for an opponent. Share the code or the invite link!" : isHost ? "Everyone's here. Check the rules and start!" : "Waiting for the host to start the game…"}
              </p>
            </div>
            {isHost ? (
              <RulesEditor rules={room.settings.rules} onChange={(rules) => send({ t: "settings", settings: { rules } })} hide={["hints"]} />
            ) : (
              <p className="text-sm">
                <b>Rules:</b> {describeRules(room.settings.rules)} {room.settings.rules.takebacks ? "· takebacks allowed" : ""}
              </p>
            )}
            {isHost && (
              <button className="btn-primary w-full py-3" disabled={players.length < 2} onClick={() => send({ t: "start" })}>
                <Icon name="play" /> Start the game
              </button>
            )}
          </div>
          <div className="space-y-3">
            <Players room={room} />
            <Chat room={room} />
          </div>
        </div>
      </div>
    );

  const last = games[games.length - 1];
  const amPlayer = last && (last.white === myId || last.black === myId);
  return (
    <div className="space-y-3">
      <RoomHeader room={room} />
      {current && (
        <RoomGameView
          room={room}
          game={current}
          extraActions={
            amPlayer && current === last ? (
              <button className="btn-primary" onClick={() => send({ t: "rematch" })} disabled={room.rematch.includes(myId)}>
                <Icon name="refresh" /> {room.rematch.includes(myId) ? "Waiting…" : room.rematch.length ? "Accept rematch" : "Rematch"}
              </button>
            ) : undefined
          }
          side={
            <>
              {games.length > 1 && (
                <div className="card flex flex-wrap items-center gap-1 p-2 text-xs">
                  <span className="mr-1 muted">Games:</span>
                  {games.map((g, i) => (
                    <button key={g.id} className={g === current ? "chip-active" : "chip"} onClick={() => setGameIndex(i)}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
              {room.rematch.length > 0 && !room.rematch.includes(myId) && amPlayer && (
                <div className="card p-3 text-sm">{playerName(room, room.rematch[0])} wants a rematch!</div>
              )}
              <Players room={room} scores={scoreText} />
              <Chat room={room} />
            </>
          }
        />
      )}
    </div>
  );
}
