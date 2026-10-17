import { abandon, checkTimeout, createGame, declineOffers, makeMove, offerDraw, resign, sideToMove, takeback, normalizeGame, type GameState } from "../chess/game";
import { DEFAULT_RULES, normalizeRules, type Color, type Rules } from "../chess/rules";
import { isFinished, pairNextRound, totalRoundsFor, type Format, type TournamentState } from "./tournament";

export const PROTOCOL_VERSION = 1;

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  /** Watches only (match rooms: everyone after the first two). */
  spectator: boolean;
  /** When the player lost the connection (for the abandon timer). */
  awaySince?: number;
}

export interface RoomGame {
  id: string;
  white: string;
  black: string;
  round: number;
  state: GameState;
}

export interface ChatLine {
  from: string;
  name: string;
  text: string;
  at: number;
}

export interface RoomSettings {
  kind: "match" | "tournament";
  rules: Rules;
  /** Match: who plays White in the first game. */
  firstWhite: "host" | "guest" | "random";
  format: Format;
  swissRounds: number;
  maxPlayers: number;
  /** Seconds a disconnected player has before losing the game. */
  abandonAfter: number;
}

export interface RoomSnapshot {
  code: string;
  epoch: number;
  hostId: string;
  passwordHash: string | null;
  settings: RoomSettings;
  lobby: RoomPlayer[];
  phase: "lobby" | "playing" | "finished";
  games: Record<string, RoomGame>;
  /** Match: order of games (rematches). */
  matchGames: string[];
  rematch: string[];
  tournament: TournamentState | null;
  chat: ChatLine[];
  seq: number;
}

export type RoomAction =
  | { t: "move"; gameId: string; uci: string }
  | { t: "resign"; gameId: string }
  | { t: "draw"; gameId: string }
  | { t: "decline"; gameId: string }
  | { t: "takeback"; gameId: string }
  | { t: "chat"; text: string }
  | { t: "settings"; settings: Partial<RoomSettings> }
  | { t: "start" }
  | { t: "nextRound" }
  | { t: "rematch" }
  | { t: "kick"; id: string }
  | { t: "spectate"; on: boolean };

export type RoomError = "notHost" | "notPlayer" | "notYourGame" | "badPhase" | "illegal" | "tooFewPlayers" | "unknownGame" | "notAllowed";
export type RoomUpdate = { ok: true; room: RoomSnapshot } | { ok: false; error: RoomError };

export const ERROR_TEXT: Record<RoomError | string, string> = {
  notHost: "Only the host can do that.",
  notPlayer: "You are not playing in this room.",
  notYourGame: "That's not your game.",
  badPhase: "Not possible right now.",
  illegal: "Illegal move.",
  tooFewPlayers: "At least two players are needed.",
  unknownGame: "Unknown game.",
  notAllowed: "Not allowed by the rules of this room.",
  password: "Wrong password.",
  full: "The room is full.",
  started: "The game has already started.",
  version: "Your version of Chess Lab differs from the host's. Reload the page.",
  kicked: "You were removed from the room.",
  notFound: "Room not found. Check the code.",
};

export const DEFAULT_SETTINGS: RoomSettings = {
  kind: "match",
  rules: { ...DEFAULT_RULES, clock: { whiteMs: 300_000, blackMs: 300_000, incrementMs: 3000 }, takebacks: false },
  firstWhite: "random",
  format: "roundRobin",
  swissRounds: 4,
  maxPlayers: 16,
  abandonAfter: 60,
};

export function createRoom(code: string, host: { id: string; name: string }, settings: Partial<RoomSettings>, passwordHash: string | null): RoomSnapshot {
  return {
    code,
    epoch: 0,
    hostId: host.id,
    passwordHash,
    settings: normalizeSettings(settings),
    lobby: [{ id: host.id, name: host.name, connected: true, spectator: false }],
    phase: "lobby",
    games: {},
    matchGames: [],
    rematch: [],
    tournament: null,
    chat: [],
    seq: 0,
  };
}

export function normalizeSettings(s: Partial<RoomSettings> | undefined): RoomSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), rules: normalizeRules(s?.rules ?? DEFAULT_SETTINGS.rules) };
}

export function normalizeRoom(r: RoomSnapshot): RoomSnapshot {
  return {
    ...r,
    settings: normalizeSettings(r.settings),
    games: Object.fromEntries(Object.entries(r.games ?? {}).map(([k, g]) => [k, { ...g, state: normalizeGame(g.state) }])),
    matchGames: r.matchGames ?? [],
    rematch: r.rematch ?? [],
    chat: r.chat ?? [],
    seq: r.seq ?? 0,
  };
}

const players = (r: RoomSnapshot) => r.lobby.filter((p) => !p.spectator);
export const playerName = (r: RoomSnapshot, id: string) => r.lobby.find((p) => p.id === id)?.name ?? "?";
export const colorOf = (g: RoomGame, id: string): Color | null => (g.white === id ? "w" : g.black === id ? "b" : null);

let gameSeq = 0;
const gameId = (r: RoomSnapshot) => `${r.code}-${r.seq}-${(++gameSeq).toString(36)}`;

function newGame(r: RoomSnapshot, white: string, black: string, round: number, now: number): RoomGame {
  const rules = r.settings.rules.start === "shuffle" ? { ...r.settings.rules, shuffleSeed: Math.floor(now % 1e9) + r.seq } : r.settings.rules;
  return { id: gameId(r), white, black, round, state: createGame(rules) };
}

/** Host-side reducer for every player action. Pure: never mutates `input`. */
export function applyRoomAction(input: RoomSnapshot, actor: string, action: RoomAction, now: number): RoomUpdate {
  const r = structuredClone(input);
  r.seq += 1;
  const isHost = actor === r.hostId;
  const me = r.lobby.find((p) => p.id === actor);
  if (!me) return { ok: false, error: "notPlayer" };

  switch (action.t) {
    case "chat": {
      const text = action.text.trim().slice(0, 300);
      if (!text) return { ok: false, error: "badPhase" };
      r.chat = [...r.chat, { from: actor, name: me.name, text, at: now }].slice(-100);
      return { ok: true, room: r };
    }
    case "settings": {
      if (!isHost) return { ok: false, error: "notHost" };
      if (r.phase !== "lobby") return { ok: false, error: "badPhase" };
      r.settings = normalizeSettings({ ...r.settings, ...action.settings });
      if (r.settings.kind === "match") r.lobby.forEach((p, i) => (p.spectator = i >= 2));
      else r.lobby.forEach((p) => (p.spectator = false));
      return { ok: true, room: r };
    }
    case "kick": {
      if (!isHost || action.id === r.hostId) return { ok: false, error: "notHost" };
      if (r.phase !== "lobby") return { ok: false, error: "badPhase" };
      r.lobby = r.lobby.filter((p) => p.id !== action.id);
      return { ok: true, room: r };
    }
    case "spectate": {
      if (r.phase !== "lobby") return { ok: false, error: "badPhase" };
      me.spectator = action.on;
      return { ok: true, room: r };
    }
    case "start": {
      if (!isHost) return { ok: false, error: "notHost" };
      if (r.phase !== "lobby") return { ok: false, error: "badPhase" };
      const ps = players(r).map((p) => p.id);
      if (ps.length < 2) return { ok: false, error: "tooFewPlayers" };
      if (r.settings.kind === "match") {
        const [a, b] = ps;
        const hostIsWhite = r.settings.firstWhite === "host" || (r.settings.firstWhite === "random" && now % 2 === 0);
        const host = a === r.hostId ? a : b;
        const guest = host === a ? b : a;
        const g = hostIsWhite ? newGame(r, host, guest, 1, now) : newGame(r, guest, host, 1, now);
        r.games[g.id] = g;
        r.matchGames = [g.id];
        r.lobby.forEach((p) => (p.spectator = p.id !== a && p.id !== b));
      } else {
        r.tournament = { format: r.settings.format, totalRounds: totalRoundsFor(r.settings.format, ps.length, r.settings.swissRounds), round: 0, pairings: [], seed: now % 1e9 };
        startRound(r, now);
      }
      r.phase = "playing";
      return { ok: true, room: r };
    }
    case "nextRound": {
      if (!isHost) return { ok: false, error: "notHost" };
      const t = r.tournament;
      if (!t || r.phase !== "playing") return { ok: false, error: "badPhase" };
      if (t.pairings.some((p) => p.round === t.round && !p.result)) return { ok: false, error: "badPhase" };
      if (isFinished(t)) {
        r.phase = "finished";
        return { ok: true, room: r };
      }
      startRound(r, now);
      return { ok: true, room: r };
    }
    case "rematch": {
      if (r.settings.kind !== "match" || !r.matchGames.length) return { ok: false, error: "badPhase" };
      const last = r.games[r.matchGames[r.matchGames.length - 1]];
      if (!last.state.result) return { ok: false, error: "badPhase" };
      if (actor !== last.white && actor !== last.black) return { ok: false, error: "notPlayer" };
      if (!r.rematch.includes(actor)) r.rematch.push(actor);
      if (r.rematch.length >= 2) {
        const g = newGame(r, last.black, last.white, r.matchGames.length + 1, now);
        r.games[g.id] = g;
        r.matchGames.push(g.id);
        r.rematch = [];
      }
      return { ok: true, room: r };
    }
  }

  // Game actions.
  const g = r.games[action.gameId];
  if (!g) return { ok: false, error: "unknownGame" };
  const color = colorOf(g, actor);
  if (!color) return { ok: false, error: "notYourGame" };
  let res;
  switch (action.t) {
    case "move":
      if (sideToMove(g.state) !== color) return { ok: false, error: "illegal" };
      res = makeMove(g.state, action.uci, now);
      break;
    case "resign":
      res = resign(g.state, color, now);
      break;
    case "draw":
      res = offerDraw(g.state, color, now);
      break;
    case "decline":
      res = { ok: true as const, state: declineOffers(g.state) };
      break;
    case "takeback": {
      if (!g.state.rules.takebacks) return { ok: false, error: "notAllowed" };
      // First request = offer; the opponent's request = accept (undo the last move).
      if (g.state.takebackOffer && g.state.takebackOffer !== color) res = takeback(g.state, 1, now);
      else res = { ok: true as const, state: { ...g.state, takebackOffer: color } };
      break;
    }
  }
  if (!res.ok) return { ok: false, error: res.error === "illegal" ? "illegal" : "badPhase" };
  g.state = res.state;
  onGameChanged(r, g, now);
  return { ok: true, room: r };
}

function startRound(r: RoomSnapshot, now: number) {
  const t = r.tournament!;
  const ps = players(r).map((p) => p.id);
  const pairs = pairNextRound(t, ps);
  t.round += 1;
  pairs.forEach(([white, black], i) => {
    const pairing = { id: `r${t.round}b${i + 1}`, round: t.round, white, black, gameIds: [] as string[], result: null as { w: number; b: number } | null, winner: undefined as string | undefined };
    if (black === null) {
      pairing.result = { w: 1, b: 0 };
      pairing.winner = white;
    } else {
      const g = newGame(r, white, black, t.round, now);
      r.games[g.id] = g;
      pairing.gameIds.push(g.id);
    }
    t.pairings.push(pairing);
  });
}

/** Updates the tournament when a game ends. */
function onGameChanged(r: RoomSnapshot, g: RoomGame, now: number) {
  const t = r.tournament;
  if (!g.state.result || !t) return;
  const p = t.pairings.find((x) => x.gameIds.includes(g.id));
  if (!p || p.result) return;
  const w = g.state.result.winner;
  const scoreForPairingWhite = (winner: Color | null) => {
    if (winner === null) return 0.5;
    const winnerId = winner === "w" ? g.white : g.black;
    return winnerId === p.white ? 1 : 0;
  };
  if (t.format !== "knockout") {
    const s = scoreForPairingWhite(w);
    p.result = { w: s, b: 1 - s };
    return;
  }
  // Knockout: draws are replayed with colours swapped; the third game is Armageddon (draw = Black wins).
  if (w === null && p.gameIds.length < 3) {
    const next = newGame(r, g.black, g.white, p.round, now);
    r.games[next.id] = next;
    p.gameIds.push(next.id);
    return;
  }
  const winnerColor: Color = w ?? "b";
  const winnerId = winnerColor === "w" ? g.white : g.black;
  p.winner = winnerId;
  p.result = winnerId === p.white ? { w: 1, b: 0 } : { w: 0, b: 1 };
}

/** Host tick: clocks, abandons. Returns null when nothing changed. */
export function roomTick(input: RoomSnapshot, now: number): RoomSnapshot | null {
  let r: RoomSnapshot | null = null;
  for (const g of Object.values(input.games)) {
    if (g.state.result) continue;
    let state = checkTimeout(g.state, now);
    if (!state) {
      // A player gone for too long loses the game.
      for (const color of ["w", "b"] as Color[]) {
        const p = input.lobby.find((x) => x.id === (color === "w" ? g.white : g.black));
        if (p && !p.connected && p.awaySince && now - p.awaySince > input.settings.abandonAfter * 1000) {
          const res = abandon(g.state, color, now);
          if (res.ok) state = res.state;
          break;
        }
      }
    }
    if (state) {
      r ??= structuredClone(input);
      r.seq += 1;
      const rg = r.games[g.id];
      rg.state = state;
      onGameChanged(r, rg, now);
    }
  }
  return r;
}

export function setConnected(input: RoomSnapshot, id: string, connected: boolean, now: number): RoomSnapshot {
  const r = structuredClone(input);
  const p = r.lobby.find((x) => x.id === id);
  if (p) {
    p.connected = connected;
    p.awaySince = connected ? undefined : now;
  }
  r.seq += 1;
  return r;
}

/** A player joins (or comes back). Returns the seat id to use, or an error code. */
export function joinRoom(input: RoomSnapshot, who: { id: string; name: string }, now: number): { room: RoomSnapshot; id: string } | { error: "full" | "started" } {
  const r = structuredClone(input);
  let seat = r.lobby.find((p) => p.id === who.id) ?? r.lobby.find((p) => !p.connected && p.name === who.name);
  if (!seat) {
    if (r.lobby.length >= r.settings.maxPlayers) return { error: "full" };
    const spectator = r.phase !== "lobby" || (r.settings.kind === "match" && players(r).length >= 2);
    seat = { id: who.id, name: who.name.slice(0, 24) || "Player", connected: true, spectator };
    r.lobby.push(seat);
  }
  seat.connected = true;
  seat.awaySince = undefined;
  void now;
  r.seq += 1;
  return { room: r, id: seat.id };
}

/** Games a player is in, newest first. */
export function gamesOf(r: RoomSnapshot, id: string): RoomGame[] {
  return Object.values(r.games)
    .filter((g) => g.white === id || g.black === id)
    .sort((a, b) => b.round - a.round || b.id.localeCompare(a.id));
}
