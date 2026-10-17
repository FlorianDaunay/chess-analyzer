import type { RoomAction, RoomSnapshot } from "@/core/room/room";

export const PEER_PREFIX = "chesslab-v1";
export const hostPeerId = (code: string, epoch: number) => `${PEER_PREFIX}-${code.toUpperCase()}-${epoch}`;

export type ToHost =
  | { t: "hello"; version: number; playerId: string; name: string; passwordHash: string | null }
  | { t: "action"; action: RoomAction }
  | { t: "ping" }
  | { t: "leave" };

export type ToClient =
  | { t: "welcome"; playerId: string; room: RoomSnapshot }
  | { t: "reject"; reason: "password" | "full" | "started" | "version" | "kicked" }
  | { t: "snapshot"; room: RoomSnapshot }
  | { t: "error"; code: string }
  | { t: "ping" }
  | { t: "leave" };

export const HEARTBEAT_MS = 1000;
export const PEER_TIMEOUT_MS = 8000;
export const MIGRATION_RETRY_MS = 15_000;
export const TAKEOVER_GRACE_MS = 20_000;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(length = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

/** SHA-256 of code + password; never sent in clear. Fallback hash for insecure contexts (LAN over http). */
export async function hashPassword(code: string, password: string): Promise<string | null> {
  if (!password) return null;
  const text = `${code.toUpperCase()}:${password}`;
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `fnv-${(h >>> 0).toString(16)}`;
}
