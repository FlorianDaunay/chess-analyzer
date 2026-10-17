import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_SETTINGS, colorOf, playerName, type RoomGame, type RoomSettings, type RoomSnapshot } from "@/core/room/room";
import { FORMATS } from "@/core/room/tournament";
import { toPgn, other } from "@/core/chess/game";
import type { Color } from "@/core/chess/rules";
import { useRoom } from "@/net/roomStore";
import { useSettings } from "@/store/settings";
import { useReview } from "@/store/review";
import { GameView } from "@/ui/game/GameView";
import { RulesEditor, rulesValid } from "@/ui/game/RulesEditor";
import { Icon } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";

export function NameField() {
  const { playerName: name, set } = useSettings();
  return (
    <label className="block">
      <span className="label">Your name</span>
      <input className="input" value={name} maxLength={24} placeholder="Player" onChange={(e) => set({ playerName: e.target.value })} />
    </label>
  );
}

export function CreateJoin({ kind, initialFen }: { kind: "match" | "tournament"; initialFen?: string }) {
  const { create, join, busy, error } = useRoom();
  const [settings, setSettings] = useState<RoomSettings>(() => ({
    ...DEFAULT_SETTINGS,
    kind,
    rules: initialFen ? { ...DEFAULT_SETTINGS.rules, start: "fen", fen: initialFen } : DEFAULT_SETTINGS.rules,
  }));
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(() => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("room") ?? "");
  const [joinPassword, setJoinPassword] = useState("");
  const patch = (p: Partial<RoomSettings>) => setSettings((s) => ({ ...s, ...p }));

  return (
    <div className="space-y-4">
      {error && <div className="card border-danger/50 bg-danger/10 text-sm text-danger">{error}</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create(settings, password);
          }}
        >
          <h2>{kind === "match" ? "Create a room" : "Create a tournament"}</h2>
          <NameField />
          {kind === "tournament" && (
            <div>
              <span className="label">Format</span>
              <div className="flex flex-wrap gap-1.5">
                {FORMATS.map((f) => (
                  <button type="button" key={f.id} className={settings.format === f.id ? "chip-active" : "chip"} onClick={() => patch({ format: f.id })}>
                    {f.name}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs muted">{FORMATS.find((f) => f.id === settings.format)?.description}</p>
              {settings.format === "swiss" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  Rounds
                  <input type="number" min={1} max={15} className="input w-20" value={settings.swissRounds} onChange={(e) => patch({ swissRounds: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })} />
                </label>
              )}
            </div>
          )}
          {kind === "match" && (
            <div>
              <span className="label">First game: you play</span>
              <div className="flex gap-1.5">
                {(
                  [
                    ["host", "White"],
                    ["random", "Random"],
                    ["guest", "Black"],
                  ] as const
                ).map(([v, l]) => (
                  <button type="button" key={v} className={settings.firstWhite === v ? "chip-active" : "chip"} onClick={() => patch({ firstWhite: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <RulesEditor rules={settings.rules} onChange={(rules) => patch({ rules })} hide={["hints"]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Password (optional)</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="block">
              <span className="label">Disconnected player loses after</span>
              <select className="input" value={settings.abandonAfter} onChange={(e) => patch({ abandonAfter: Number(e.target.value) })}>
                {[30, 60, 120, 300].map((s) => (
                  <option key={s} value={s}>
                    {s < 60 ? `${s} s` : `${s / 60} min`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn-primary w-full py-3" disabled={busy || !rulesValid(settings.rules)}>
            <Icon name="plus" /> {busy ? "Connecting…" : kind === "match" ? "Create room" : "Create tournament"}
          </button>
        </form>

        <form
          className="card h-fit space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void join(code, joinPassword);
          }}
        >
          <h2>Join</h2>
          <NameField />
          <label className="block">
            <span className="label">Room code</span>
            <input className="input font-mono text-lg uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCDE" maxLength={8} />
          </label>
          <label className="block">
            <span className="label">Password (if any)</span>
            <input className="input" type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
          </label>
          <button className="btn-primary w-full" disabled={busy || !code.trim()}>
            <Icon name="link" /> {busy ? "Connecting…" : "Join"}
          </button>
          <div className="flex items-start gap-2 pt-2 text-xs muted">
            <Mascot size={36} mood="talking" className="shrink-0" />
            Games travel directly between browsers (WebRTC). A public broker only introduces the players. Some strict networks (corporate, some mobile carriers) can block direct connections.
          </div>
        </form>
      </div>
    </div>
  );
}

export function RoomHeader({ room }: { room: RoomSnapshot }) {
  const { status, detail, leave, myId } = useRoom();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}#/${room.settings.kind === "match" ? "online" : "tournament"}?room=${room.code}`;
  return (
    <div className="card flex flex-wrap items-center gap-3 p-3">
      <div>
        <div className="text-xs muted">Room code</div>
        <div className="font-mono text-2xl font-bold tracking-widest">{room.code}</div>
      </div>
      <button
        className="btn"
        onClick={() => {
          void navigator.clipboard?.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <Icon name={copied ? "check" : "share"} /> {copied ? "Link copied" : "Copy invite link"}
      </button>
      {room.passwordHash && <span className="badge">🔒 password</span>}
      <span className={`badge ${status === "reconnecting" ? "bg-warning/20" : ""}`}>
        <span className={`h-2 w-2 rounded-full ${status === "reconnecting" ? "bg-warning" : "bg-success"}`} />
        {status === "host" ? "You are the host" : status === "client" ? `Host: ${playerName(room, room.hostId)}` : status === "reconnecting" ? detail ?? "Reconnecting…" : status}
      </span>
      {room.hostId === myId && status !== "host" && <span className="badge">host</span>}
      <button
        className="btn-danger ml-auto"
        onClick={() => {
          if (confirm("Leave the room?")) leave();
        }}
      >
        <Icon name="x" /> Leave
      </button>
    </div>
  );
}

export function Players({ room, scores }: { room: RoomSnapshot; scores?: Record<string, string> }) {
  const { myId, send } = useRoom();
  const isHost = room.hostId === myId;
  return (
    <div className="card p-3">
      <h2 className="mb-2 text-base">Players · {room.lobby.filter((p) => !p.spectator).length}</h2>
      <ul className="space-y-1">
        {room.lobby.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-success" : "bg-text-muted"}`} title={p.connected ? "online" : "offline"} />
            <span className={`truncate ${p.id === myId ? "font-semibold" : ""}`}>
              {p.name}
              {p.id === myId && " (you)"}
            </span>
            {p.id === room.hostId && <Icon name="crown" size={14} className="text-warning" />}
            {p.spectator && <span className="badge">spectator</span>}
            {scores?.[p.id] && <span className="ml-auto font-semibold tabular-nums">{scores[p.id]}</span>}
            {isHost && room.phase === "lobby" && p.id !== myId && (
              <button className="ml-auto text-xs text-danger hover:underline" onClick={() => send({ t: "kick", id: p.id })}>
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {room.phase === "lobby" && room.settings.kind === "tournament" && (
        <button className="btn-sm btn mt-2" onClick={() => send({ t: "spectate", on: !room.lobby.find((p) => p.id === myId)?.spectator })}>
          {room.lobby.find((p) => p.id === myId)?.spectator ? "Play" : "Just watch"}
        </button>
      )}
    </div>
  );
}

export function Chat({ room }: { room: RoomSnapshot }) {
  const { send, myId } = useRoom();
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [room.chat.length]);
  return (
    <div className="card p-3">
      <div ref={ref} className="mb-2 max-h-40 space-y-1 overflow-y-auto text-sm">
        {room.chat.length === 0 && <p className="muted">Say hi!</p>}
        {room.chat.map((c, i) => (
          <p key={i}>
            <b className={c.from === myId ? "text-accent" : ""}>{c.name}:</b> {c.text}
          </p>
        ))}
      </div>
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send({ t: "chat", text });
          setText("");
        }}
      >
        <input className="input py-1.5" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={300} />
        <button className="btn-icon btn" aria-label="Send">
          <Icon name="forward" />
        </button>
      </form>
      <div className="mt-1 flex gap-1">
        {["👋", "👍", "gg", "😅", "🔥"].map((q) => (
          <button key={q} className="btn-sm btn-ghost" onClick={() => send({ t: "chat", text: q })}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One game of the room, playable by its two players, watchable by everyone else. */
export function RoomGameView({ room, game, extraActions, side }: { room: RoomSnapshot; game: RoomGame; extraActions?: React.ReactNode; side?: React.ReactNode }) {
  const { myId, send } = useRoom();
  const navigate = useNavigate();
  const openReview = useReview((s) => s.open);
  const mine = colorOf(game, myId);
  const [orientation, setOrientation] = useState<Color>(mine ?? "w");
  useEffect(() => setOrientation(mine ?? "w"), [game.id, mine]);
  const players = useMemo(
    () => ({
      w: { name: `${playerName(room, game.white)}${room.lobby.find((p) => p.id === game.white)?.connected === false ? " (offline)" : ""}` },
      b: { name: `${playerName(room, game.black)}${room.lobby.find((p) => p.id === game.black)?.connected === false ? " (offline)" : ""}` },
    }),
    [room, game]
  );
  const s = game.state;
  const offerFromOpponent = (offer: Color | null) => mine && offer && offer !== mine;

  return (
    <GameView
      game={s}
      players={players}
      myColors={mine ? [mine] : []}
      orientation={orientation}
      onFlip={() => setOrientation((o) => other(o))}
      onMove={(uci) => send({ t: "move", gameId: game.id, uci })}
      onResign={() => send({ t: "resign", gameId: game.id })}
      onOfferDraw={() => send({ t: "draw", gameId: game.id })}
      onTakeback={s.rules.takebacks ? () => send({ t: "takeback", gameId: game.id }) : undefined}
      banner={
        !s.result && (offerFromOpponent(s.drawOffer) || offerFromOpponent(s.takebackOffer)) ? (
          <div className="animate-pop mb-2 flex flex-wrap items-center gap-2 rounded-card border border-accent bg-accent/10 p-2 text-sm">
            <Mascot size={30} mood="surprised" />
            <span className="flex-1">Your opponent {offerFromOpponent(s.drawOffer) ? "offers a draw" : "asks to take back a move"}.</span>
            <button className="btn-sm btn-primary" onClick={() => send({ t: offerFromOpponent(s.drawOffer) ? "draw" : "takeback", gameId: game.id })}>
              Accept
            </button>
            <button className="btn-sm btn" onClick={() => send({ t: "decline", gameId: game.id })}>
              Decline
            </button>
          </div>
        ) : mine && !s.result && (s.drawOffer === mine || s.takebackOffer === mine) ? (
          <div className="mb-2 rounded-card bg-surface-hover p-2 text-center text-xs muted">Waiting for your opponent's answer…</div>
        ) : !mine ? (
          <div className="mb-2 rounded-card bg-surface-hover p-2 text-center text-xs muted">
            <Icon name="eye" size={12} className="inline" /> Spectating
          </div>
        ) : undefined
      }
      gameOverActions={
        <>
          {extraActions}
          <button
            className="btn"
            onClick={() => {
              const white = playerName(room, game.white);
              const black = playerName(room, game.black);
              openReview({ id: `room-${game.id}`, pgn: toPgn(s, { White: white, Black: black, Event: `Chess Lab room ${room.code}` }), white, black, orientation: mine ?? "w" });
              navigate("/review");
            }}
          >
            <Icon name="chart" /> Analyze
          </button>
        </>
      }
      side={side}
    />
  );
}
