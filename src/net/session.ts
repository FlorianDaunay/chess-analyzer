import Peer, { type DataConnection } from "peerjs";
import { PROTOCOL_VERSION, applyRoomAction, createRoom, joinRoom, normalizeRoom, roomTick, setConnected, type RoomAction, type RoomSettings, type RoomSnapshot } from "@/core/room/room";
import { HEARTBEAT_MS, MIGRATION_RETRY_MS, PEER_TIMEOUT_MS, TAKEOVER_GRACE_MS, hostPeerId, type ToClient, type ToHost } from "./protocol";

export type SessionStatus = "connecting" | "host" | "client" | "reconnecting" | "closed";

export interface SessionEvents {
  room: (room: RoomSnapshot) => void;
  status: (status: SessionStatus, detail?: string) => void;
  error: (code: string) => void;
}

interface Me {
  playerId: string;
  name: string;
  passwordHash: string | null;
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const onError = (e: { type?: string }) => {
      peer.destroy();
      reject(e);
    };
    peer.once("open", () => {
      peer.off("error", onError);
      resolve(peer);
    });
    peer.once("error", onError);
  });
}

function connect(peer: Peer, target: string, timeoutMs = 6000): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const conn = peer.connect(target, { reliable: true, serialization: "json" });
    const timer = setTimeout(() => {
      cleanup();
      conn.close();
      reject(new Error("timeout"));
    }, timeoutMs);
    const onPeerError = (e: { type?: string }) => {
      if (e.type === "peer-unavailable") {
        cleanup();
        reject(new Error("unavailable"));
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      peer.off("error", onPeerError);
    };
    peer.on("error", onPeerError);
    conn.once("open", () => {
      cleanup();
      resolve(conn);
    });
    conn.once("error", () => {
      cleanup();
      reject(new Error("conn"));
    });
  });
}

/**
 * A room session: either the host (authoritative, runs the reducer and broadcasts full
 * snapshots) or a client. Every peer keeps the full snapshot, so when the host disappears the
 * first connected player in lobby order takes over (epoch + 1) and the others reconnect.
 */
export class RoomSession {
  status: SessionStatus = "connecting";
  room: RoomSnapshot | null = null;
  private peer: Peer | null = null;
  private me: Me;
  private code: string;
  private listeners: Partial<{ [K in keyof SessionEvents]: SessionEvents[K][] }> = {};
  // Host state
  private conns = new Map<string, { conn: DataConnection; lastSeen: number }>();
  private timers: ReturnType<typeof setInterval>[] = [];
  // Client state
  private hostConn: DataConnection | null = null;
  private lastFromHost = 0;
  private closedForGood = false;

  private constructor(code: string, me: Me) {
    this.code = code.toUpperCase();
    this.me = me;
  }

  get playerId() {
    return this.me.playerId;
  }
  isClosed() {
    return this.status === "closed";
  }

  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]) {
    (this.listeners[event] ??= []).push(fn as never);
    return () => {
      this.listeners[event] = (this.listeners[event] as SessionEvents[K][]).filter((f) => f !== fn) as never;
    };
  }
  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>) {
    (this.listeners[event] as ((...a: unknown[]) => void)[] | undefined)?.forEach((f) => f(...args));
  }
  private setStatus(s: SessionStatus, detail?: string) {
    this.status = s;
    this.emit("status", s, detail);
  }
  private setRoom(room: RoomSnapshot) {
    this.room = room;
    this.emit("room", room);
  }

  // ---------- creation ----------

  static async host(code: string, me: Me, settings: Partial<RoomSettings>): Promise<RoomSession> {
    const s = new RoomSession(code, me);
    const room = createRoom(s.code, { id: me.playerId, name: me.name }, settings, me.passwordHash);
    await s.becomeHost(room);
    return s;
  }

  static async join(code: string, me: Me): Promise<RoomSession> {
    const s = new RoomSession(code, me);
    s.peer = await openPeer();
    for (let epoch = 0; epoch < 12; epoch++) {
      try {
        const conn = await connect(s.peer, hostPeerId(s.code, epoch), 5000);
        const ok = await s.handshake(conn);
        if (ok === true) return s;
        s.peer.destroy();
        throw new Error(ok);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg !== "unavailable" && msg !== "timeout" && msg !== "conn") throw e;
      }
    }
    s.peer.destroy();
    throw new Error("notFound");
  }

  // ---------- host ----------

  private async becomeHost(room: RoomSnapshot) {
    this.peer?.destroy();
    this.peer = await openPeer(hostPeerId(this.code, room.epoch));
    this.peer.on("connection", (conn) => this.onClientConnection(conn));
    this.peer.on("disconnected", () => this.peer?.reconnect());
    this.setRoom(room);
    this.setStatus("host");
    this.timers.push(
      setInterval(() => {
        const now = Date.now();
        for (const [id, c] of this.conns) {
          if (now - c.lastSeen > PEER_TIMEOUT_MS) {
            c.conn.close();
            this.conns.delete(id);
            this.update(setConnected(this.room!, id, false, now));
          } else c.conn.send({ t: "ping" } satisfies ToClient);
        }
      }, HEARTBEAT_MS),
      setInterval(() => {
        const next = this.room && roomTick(this.room, Date.now());
        if (next) this.update(next);
      }, 250)
    );
  }

  private onClientConnection(conn: DataConnection) {
    let playerId: string | null = null;
    conn.on("data", (raw) => {
      const msg = raw as ToHost;
      const room = this.room!;
      if (msg.t === "hello") {
        if (msg.version !== PROTOCOL_VERSION) return this.reject(conn, "version");
        if (room.passwordHash && msg.passwordHash !== room.passwordHash) return this.reject(conn, "password");
        const res = joinRoom(room, { id: msg.playerId, name: msg.name }, Date.now());
        if ("error" in res) return this.reject(conn, res.error);
        playerId = res.id;
        this.conns.get(playerId)?.conn.close();
        this.conns.set(playerId, { conn, lastSeen: Date.now() });
        conn.send({ t: "welcome", playerId, room: res.room } satisfies ToClient);
        this.update(res.room);
        return;
      }
      if (!playerId) return;
      const entry = this.conns.get(playerId);
      if (entry) entry.lastSeen = Date.now();
      if (msg.t === "action") {
        const res = applyRoomAction(room, playerId, msg.action, Date.now());
        if (res.ok) {
          this.update(res.room);
          if (msg.action.t === "kick") this.dropKicked(msg.action.id);
        } else conn.send({ t: "error", code: res.error } satisfies ToClient);
      } else if (msg.t === "leave") {
        this.conns.delete(playerId);
        conn.close();
        this.update(setConnected(room, playerId, false, Date.now()));
      }
    });
    conn.on("close", () => {
      if (playerId && this.conns.get(playerId)?.conn === conn) {
        this.conns.delete(playerId);
        if (this.room) this.update(setConnected(this.room, playerId, false, Date.now()));
      }
    });
  }

  private dropKicked(id: string) {
    const c = this.conns.get(id);
    if (!c) return;
    c.conn.send({ t: "reject", reason: "kicked" } satisfies ToClient);
    setTimeout(() => c.conn.close(), 300);
    this.conns.delete(id);
  }

  private reject(conn: DataConnection, reason: "password" | "full" | "started" | "version" | "kicked") {
    conn.send({ t: "reject", reason } satisfies ToClient);
    setTimeout(() => conn.close(), 300);
  }

  /** Host: adopt and broadcast a new snapshot. */
  private update(room: RoomSnapshot) {
    this.setRoom(room);
    const msg: ToClient = { t: "snapshot", room };
    for (const { conn } of this.conns.values()) if (conn.open) conn.send(msg);
  }

  // ---------- client ----------

  private handshake(conn: DataConnection): Promise<true | string> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), 6000);
      conn.on("data", (raw) => {
        const msg = raw as ToClient;
        this.lastFromHost = Date.now();
        if (msg.t === "welcome") {
          clearTimeout(timer);
          this.me.playerId = msg.playerId;
          this.hostConn = conn;
          this.setRoom(normalizeRoom(msg.room));
          this.setStatus("client");
          this.startClientWatch();
          resolve(true);
        } else if (msg.t === "reject") {
          clearTimeout(timer);
          if (this.status === "client" || this.status === "reconnecting") {
            this.closedForGood = true;
            this.close(msg.reason);
          }
          resolve(msg.reason);
        } else if (msg.t === "snapshot") this.setRoom(normalizeRoom(msg.room));
        else if (msg.t === "error") this.emit("error", msg.code);
        else if (msg.t === "leave") this.onHostLost();
      });
      conn.on("close", () => {
        if (this.hostConn === conn) this.onHostLost();
      });
      conn.send({ t: "hello", version: PROTOCOL_VERSION, playerId: this.me.playerId, name: this.me.name, passwordHash: this.me.passwordHash } satisfies ToHost);
    });
  }

  private startClientWatch() {
    this.clearTimers();
    this.timers.push(
      setInterval(() => {
        if (this.status !== "client") return;
        if (this.hostConn?.open) this.hostConn.send({ t: "ping" } satisfies ToHost);
        if (Date.now() - this.lastFromHost > PEER_TIMEOUT_MS) this.onHostLost();
      }, HEARTBEAT_MS)
    );
  }

  private migrating = false;
  private async onHostLost() {
    if (this.migrating || this.closedForGood || this.status === "closed" || this.status === "host") return;
    this.migrating = true;
    this.hostConn = null;
    this.clearTimers();
    this.setStatus("reconnecting", "The host left. Finding a new host…");
    const old = this.room!;
    const candidates = old.lobby.filter((p) => p.id !== old.hostId && p.connected);
    for (let a = 0; a < Math.max(1, candidates.length); a++) {
      const candidate = candidates[a];
      const epoch = old.epoch + 1 + a;
      if (!candidate || candidate.id === this.me.playerId) {
        // I take over.
        let room = setConnected({ ...old, epoch, hostId: this.me.playerId }, old.hostId, false, Date.now());
        room = { ...room, lobby: room.lobby.map((p) => (p.id === this.me.playerId ? { ...p, connected: true } : p)) };
        try {
          await this.becomeHost(room);
          this.migrating = false;
          // Players that never come back are marked away.
          setTimeout(() => {
            if (this.status !== "host" || !this.room) return;
            let r = this.room;
            for (const p of r.lobby) if (p.id !== this.me.playerId && p.connected && !this.conns.has(p.id)) r = setConnected(r, p.id, false, Date.now());
            if (r !== this.room) this.update(r);
          }, TAKEOVER_GRACE_MS);
          return;
        } catch {
          continue;
        }
      }
      // Someone else takes over: retry connecting to them for a while.
      const until = Date.now() + MIGRATION_RETRY_MS;
      while (Date.now() < until && !this.closedForGood) {
        try {
          const conn = await connect(this.peer!, hostPeerId(this.code, epoch), 4000);
          const ok = await this.handshake(conn);
          if (ok === true) {
            this.migrating = false;
            return;
          }
          this.closedForGood = true;
          this.close(ok);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
    this.migrating = false;
    this.close("notFound");
  }

  // ---------- both ----------

  send(action: RoomAction) {
    if (this.status === "host") {
      const res = applyRoomAction(this.room!, this.me.playerId, action, Date.now());
      if (res.ok) {
        this.update(res.room);
        if (action.t === "kick") this.dropKicked(action.id);
      } else this.emit("error", res.error);
    } else if (this.hostConn?.open) this.hostConn.send({ t: "action", action } satisfies ToHost);
    else this.emit("error", "badPhase");
  }

  /** Voluntary exit: lets the others migrate at once. */
  leave() {
    if (this.status === "host") {
      for (const { conn } of this.conns.values()) if (conn.open) conn.send({ t: "leave" } satisfies ToClient);
    } else if (this.hostConn?.open) {
      this.hostConn.send({ t: "leave" } satisfies ToHost);
    }
    this.closedForGood = true;
    setTimeout(() => this.close(), 200);
  }

  private clearTimers() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  close(reason?: string) {
    this.clearTimers();
    this.conns.forEach(({ conn }) => conn.close());
    this.conns.clear();
    this.peer?.destroy();
    this.setStatus("closed", reason);
  }
}
