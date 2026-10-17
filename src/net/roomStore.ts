import { create } from "zustand";
import type { RoomAction, RoomSettings, RoomSnapshot } from "@/core/room/room";
import { ERROR_TEXT } from "@/core/room/room";
import { useSettings } from "@/store/settings";
import { hashPassword, randomCode } from "./protocol";
import { RoomSession, type SessionStatus } from "./session";

const TAB_KEY = "chesslab-tab";

/** Per-tab identity: survives a reload (to get the seat back), differs between tabs. */
function tabIdentity(): { playerId: string; code?: string; passwordHash?: string | null } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TAB_KEY) ?? "null");
    if (saved?.playerId) return saved;
  } catch {
    /* ignore */
  }
  const id = { playerId: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36) };
  sessionStorage.setItem(TAB_KEY, JSON.stringify(id));
  return id;
}
function saveTab(patch: { code?: string; passwordHash?: string | null }) {
  try {
    sessionStorage.setItem(TAB_KEY, JSON.stringify({ ...tabIdentity(), ...patch }));
  } catch {
    /* ignore */
  }
}

interface RoomState {
  session: RoomSession | null;
  room: RoomSnapshot | null;
  status: SessionStatus | "idle";
  detail: string | null;
  error: string | null;
  busy: boolean;
  myId: string;
  create: (settings: Partial<RoomSettings>, password: string) => Promise<void>;
  join: (code: string, password: string, passwordHash?: string | null) => Promise<void>;
  send: (action: RoomAction) => void;
  leave: () => void;
  /** Rejoin the room this tab was in before a reload. */
  resume: () => Promise<void>;
  clearError: () => void;
}

const playerName = () => useSettings.getState().playerName.trim() || `Player ${Math.floor(Math.random() * 900 + 100)}`;

export const useRoom = create<RoomState>((set, get) => {
  const attach = (s: RoomSession) => {
    s.on("room", (room) => set({ room }));
    s.on("status", (status, detail) => {
      set({ status, detail: detail ?? null });
      // Closed with a reason (kicked, wrong password, room gone): forget the room. A plain close
      // (page reload) keeps it so the tab can rejoin.
      if (status === "closed" && detail) {
        saveTab({ code: undefined, passwordHash: undefined });
        set({ error: ERROR_TEXT[detail] ?? detail });
      }
    });
    s.on("error", (code) => {
      set({ error: ERROR_TEXT[code] ?? code });
      setTimeout(() => get().error === (ERROR_TEXT[code] ?? code) && set({ error: null }), 3000);
    });
    set({ session: s, room: s.room, status: s.status, myId: s.playerId, busy: false, error: null });
  };

  return {
    session: null,
    room: null,
    status: "idle",
    detail: null,
    error: null,
    busy: false,
    myId: tabIdentity().playerId,

    create: async (settings, password) => {
      set({ busy: true, error: null });
      const { playerId } = tabIdentity();
      // A code may already be taken on the broker: try a few.
      for (let i = 0; i < 4; i++) {
        const code = randomCode();
        const passwordHash = await hashPassword(code, password);
        try {
          const s = await RoomSession.host(code, { playerId, name: playerName(), passwordHash }, settings);
          saveTab({ code, passwordHash });
          attach(s);
          return;
        } catch (e) {
          if ((e as { type?: string }).type !== "unavailable-id") {
            set({ busy: false, error: "Could not reach the connection server. Check your internet connection." });
            return;
          }
        }
      }
      set({ busy: false, error: "Could not create a room. Try again." });
    },

    join: async (codeInput, password, knownHash) => {
      const code = codeInput.trim().toUpperCase();
      if (!code) return;
      set({ busy: true, error: null });
      const passwordHash = knownHash !== undefined ? knownHash : await hashPassword(code, password);
      try {
        const s = await RoomSession.join(code, { playerId: tabIdentity().playerId, name: playerName(), passwordHash });
        saveTab({ code, passwordHash });
        attach(s);
      } catch (e) {
        const msg = (e as Error).message;
        set({ busy: false, error: ERROR_TEXT[msg] ?? "Could not join the room." });
      }
    },

    send: (action) => get().session?.send(action),

    leave: () => {
      get().session?.leave();
      saveTab({ code: undefined, passwordHash: undefined });
      set({ session: null, room: null, status: "idle", detail: null });
    },

    resume: async () => {
      const t = tabIdentity();
      if (!t.code || get().session || get().busy) return;
      await get().join(t.code, "", t.passwordHash ?? null);
    },

    clearError: () => set({ error: null }),
  };
});

if (typeof window !== "undefined") window.addEventListener("pagehide", () => useRoom.getState().session?.leave());
