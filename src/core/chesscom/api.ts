/** chess.com public API (https://www.chess.com/news/view/published-data-api). CORS is open. */

const BASE = "https://api.chess.com/pub";

export interface CCProfile {
  username: string;
  name?: string;
  avatar?: string;
  country?: string;
  joined?: number;
  url: string;
  title?: string;
}

export interface CCStats {
  [key: string]: { last?: { rating: number; date: number }; best?: { rating: number; date: number }; record?: { win: number; loss: number; draw: number } } | unknown;
}

interface CCPlayer {
  username: string;
  rating: number;
  result: string;
}

export interface CCRawGame {
  url: string;
  pgn?: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: string;
  rules: string;
  white: CCPlayer;
  black: CCPlayer;
  accuracies?: { white: number; black: number };
  eco?: string;
  fen?: string;
}

export type Outcome = "win" | "loss" | "draw";

/** A chess.com game seen from the analyzed player's side. */
export interface GameSummary {
  id: string;
  url: string;
  pgn: string;
  endTime: number;
  timeClass: string;
  timeControl: string;
  rated: boolean;
  color: "w" | "b";
  rating: number;
  opponent: string;
  opponentRating: number;
  outcome: Outcome;
  /** chess.com result code of the loser/drawer: checkmated, resigned, timeout, agreed, repetition… */
  how: string;
  /** Opening from chess.com's ECOUrl, e.g. "Sicilian Defense Najdorf Variation". */
  opening: string;
  eco: string;
  plies: number;
  /** chess.com's own accuracy for the player, when the game was reviewed there. */
  ccAccuracy?: number;
}

export class ChessComError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
  }
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ChessComError("Network error: could not reach chess.com.");
  }
  if (res.status === 404) throw new ChessComError("Player not found on chess.com.", 404);
  if (res.status === 429) throw new ChessComError("chess.com is rate-limiting requests. Wait a minute and retry.", 429);
  if (!res.ok) throw new ChessComError(`chess.com error ${res.status}.`, res.status);
  return res.json() as Promise<T>;
}

export const fetchProfile = (user: string, signal?: AbortSignal) => get<CCProfile>(`${BASE}/player/${encodeURIComponent(user.toLowerCase())}`, signal);
export const fetchStats = (user: string, signal?: AbortSignal) => get<CCStats>(`${BASE}/player/${encodeURIComponent(user.toLowerCase())}/stats`, signal);
export const fetchArchives = async (user: string, signal?: AbortSignal) =>
  (await get<{ archives: string[] }>(`${BASE}/player/${encodeURIComponent(user.toLowerCase())}/games/archives`, signal)).archives;
export const fetchMonth = async (url: string, signal?: AbortSignal) => (await get<{ games: CCRawGame[] }>(url, signal)).games;

const DRAW_CODES = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);

export function openingFromEcoUrl(url: string | undefined): string {
  if (!url) return "Unknown";
  const slug = url.split("/openings/")[1] ?? "";
  // Drop the trailing move list chess.com appends ("...-3.Nf3-Nc6").
  const words = slug.split("-");
  const cut = words.findIndex((w) => /^\d+\./.test(w));
  return (cut >= 0 ? words.slice(0, cut) : words).join(" ").replace(/\.\.\./g, "") || "Unknown";
}

export function summarize(g: CCRawGame, user: string): GameSummary | null {
  if (!g.pgn || g.rules !== "chess") return null; // variants are not analyzable here
  const me = user.toLowerCase();
  const color = g.white.username.toLowerCase() === me ? "w" : g.black.username.toLowerCase() === me ? "b" : null;
  if (!color) return null;
  const mine = color === "w" ? g.white : g.black;
  const theirs = color === "w" ? g.black : g.white;
  const outcome: Outcome = mine.result === "win" ? "win" : DRAW_CODES.has(mine.result) ? "draw" : "loss";
  const how = outcome === "win" ? theirs.result : mine.result;
  const ecoUrl = /\[ECOUrl "([^"]*)"\]/.exec(g.pgn)?.[1];
  const eco = /\[ECO "([^"]*)"\]/.exec(g.pgn)?.[1] ?? "";
  const moveText = g.pgn.split(/\n\n/).slice(1).join(" ");
  const plies = moveText
    .replace(/\{[^}]*\}/g, " ")
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const acc = g.accuracies ? (color === "w" ? g.accuracies.white : g.accuracies.black) : undefined;
  return {
    id: g.url,
    url: g.url,
    pgn: g.pgn,
    endTime: g.end_time,
    timeClass: g.time_class,
    timeControl: g.time_control,
    rated: g.rated,
    color,
    rating: mine.rating,
    opponent: theirs.username,
    opponentRating: theirs.rating,
    outcome,
    how,
    opening: openingFromEcoUrl(ecoUrl),
    eco,
    plies,
    ccAccuracy: acc,
  };
}

export const HOW_LABEL: Record<string, string> = {
  checkmated: "Checkmate",
  resigned: "Resignation",
  timeout: "Time",
  abandoned: "Abandoned",
  agreed: "Agreement",
  repetition: "Repetition",
  stalemate: "Stalemate",
  insufficient: "Insufficient material",
  "50move": "50-move rule",
  timevsinsufficient: "Time vs insufficient material",
  lose: "Lost",
  kingofthehill: "King of the hill",
  threecheck: "Three-check",
  bughousepartnerlose: "Partner lost",
};
