import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { IncomingMessage, Server } from "http";
import { randomUUID, createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, roomsTable } from "@workspace/db";
import { logger } from "./logger";

interface HostState {
  ws: WebSocket;
  listeners: Map<string, WebSocket>;
}

interface FlacHostState {
  ws: WebSocket;
  listeners: Set<WebSocket>;
}

const hosts: Map<string, HostState> = new Map();
const flacHosts: Map<string, FlacHostState> = new Map();

export function getLiveStats(): { liveNow: number; listenersConnected: number } {
  let listeners = 0;
  for (const h of hosts.values()) {
    listeners += h.listeners.size;
  }
  for (const h of flacHosts.values()) {
    listeners += h.listeners.size;
  }
  return { liveNow: hosts.size + flacHosts.size, listenersConnected: listeners };
}

export function getRoomLiveInfo(code: string): { isLive: boolean; listenerCount: number } {
  const h = hosts.get(code);
  if (h) return { isLive: true, listenerCount: h.listeners.size };
  const fh = flacHosts.get(code);
  if (fh) return { isLive: true, listenerCount: fh.listeners.size };
  return { isLive: false, listenerCount: 0 };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeSend(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err }, "ws send failed");
  }
}

function broadcastListenerCount(code: string): void {
  const h = hosts.get(code);
  if (!h) return;
  const count = h.listeners.size;
  safeSend(h.ws, { type: "listener-count", count });
  for (const lws of h.listeners.values()) {
    safeSend(lws, { type: "listener-count", count });
  }
}

async function endRoomInDb(code: string): Promise<void> {
  try {
    await db
      .update(roomsTable)
      .set({ endedAt: new Date() })
      .where(eq(roomsTable.code, code));
  } catch (err) {
    logger.error({ err, code }, "failed to mark room ended");
  }
}

interface IncomingHostHello {
  type: "host";
  code: string;
  hostToken: string;
}
interface IncomingListenerHello {
  type: "listener";
  code: string;
}
interface IncomingHostMessage {
  type: "to-listener";
  listenerId: string;
  payload: unknown;
}
interface IncomingListenerMessage {
  type: "to-host";
  payload: unknown;
}
interface IncomingFlacHostConnect {
  type: "flac-host-connect";
  code: string;
  hostToken?: string;
}
interface IncomingFlacListenerConnect {
  type: "flac-listener";
  code: string;
}

type IncomingHello = IncomingHostHello | IncomingListenerHello;

async function attachHost(ws: WebSocket, code: string, hostToken: string): Promise<void> {
  const [room] = await db.select().from(roomsTable).where(eq(roomsTable.code, code));
  if (!room) {
    safeSend(ws, { type: "error", error: "room not found" });
    ws.close();
    return;
  }
  if (room.endedAt) {
    safeSend(ws, { type: "error", error: "room already ended" });
    ws.close();
    return;
  }
  if (room.hostTokenHash !== hashToken(hostToken)) {
    safeSend(ws, { type: "error", error: "invalid host token" });
    ws.close();
    return;
  }

  const existing = hosts.get(code);
  if (existing) {
    safeSend(existing.ws, { type: "error", error: "host replaced" });
    try {
      existing.ws.close();
    } catch {
      // ignore
    }
    for (const l of existing.listeners.values()) {
      safeSend(l, { type: "host-ended" });
    }
  }

  const state: HostState = { ws, listeners: new Map() };
  hosts.set(code, state);
  safeSend(ws, { type: "joined", role: "host" });
  logger.info({ code }, "host attached");

  ws.on("message", (raw: RawData) => {
    let msg: IncomingHostMessage | undefined;
    try {
      msg = JSON.parse(raw.toString()) as IncomingHostMessage;
    } catch {
      return;
    }
    if (msg.type !== "to-listener") return;
    const lws = state.listeners.get(msg.listenerId);
    if (!lws) return;
    safeSend(lws, { type: "from-host", payload: msg.payload });
  });

  ws.on("close", async () => {
    if (hosts.get(code) !== state) return;
    hosts.delete(code);
    for (const l of state.listeners.values()) {
      safeSend(l, { type: "host-ended" });
      try {
        l.close();
      } catch {
        // ignore
      }
    }
    await endRoomInDb(code);
    logger.info({ code }, "host detached");
  });
}

async function attachListener(ws: WebSocket, code: string): Promise<void> {
  const host = hosts.get(code);
  if (!host) {
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.code, code));
    if (!room) {
      safeSend(ws, { type: "error", error: "room not found" });
    } else {
      safeSend(ws, { type: "error", error: "host offline" });
    }
    ws.close();
    return;
  }

  const listenerId = randomUUID();
  host.listeners.set(listenerId, ws);
  safeSend(ws, { type: "joined", role: "listener", listenerId });
  safeSend(host.ws, { type: "listener-joined", listenerId });
  broadcastListenerCount(code);

  // Track peak listeners
  const currentPeak = host.listeners.size;
  void db
    .update(roomsTable)
    .set({ peakListeners: currentPeak })
    .where(eq(roomsTable.code, code))
    .catch(() => undefined);

  ws.on("message", (raw: RawData) => {
    let msg: IncomingListenerMessage | undefined;
    try {
      msg = JSON.parse(raw.toString()) as IncomingListenerMessage;
    } catch {
      return;
    }
    if (msg.type !== "to-host") return;
    safeSend(host.ws, { type: "from-listener", listenerId, payload: msg.payload });
  });

  ws.on("close", () => {
    const h = hosts.get(code);
    if (!h) return;
    if (h.listeners.get(listenerId) !== ws) return;
    h.listeners.delete(listenerId);
    safeSend(h.ws, { type: "listener-left", listenerId });
    broadcastListenerCount(code);
  });
}

async function attachFlacHost(ws: WebSocket, code: string, hostToken: string): Promise<void> {
  const [room] = await db.select().from(roomsTable).where(eq(roomsTable.code, code));
  if (!room) {
    safeSend(ws, { type: "error", error: "room not found" });
    ws.close();
    return;
  }
  if (room.endedAt) {
    safeSend(ws, { type: "error", error: "room already ended" });
    ws.close();
    return;
  }
  if (hostToken && room.hostTokenHash !== hashToken(hostToken)) {
    safeSend(ws, { type: "error", error: "invalid host token" });
    ws.close();
    return;
  }

  const existing = flacHosts.get(code);
  if (existing) {
    safeSend(existing.ws, { type: "error", error: "flac-host-replaced" });
    try {
      existing.ws.close();
    } catch {}
    for (const lws of existing.listeners) {
      safeSend(lws, { type: "flac-host-ended" });
    }
  }

  const state: FlacHostState = { ws, listeners: new Set() };
  flacHosts.set(code, state);
  safeSend(ws, { type: "joined", role: "flac-host" });
  logger.info({ code }, "flac host attached");

  ws.on("message", (raw: RawData) => {
    if (Buffer.isBuffer(raw) && raw.length > 100) {
      const flacHost = flacHosts.get(code);
      if (!flacHost) return;
      for (const lws of flacHost.listeners) {
        if (lws.readyState === WebSocket.OPEN) {
          try {
            lws.send(raw, { binary: true });
          } catch {}
        }
      }
    }
  });

  ws.on("close", async () => {
    const h = flacHosts.get(code);
    if (h !== state) return;
    flacHosts.delete(code);
    for (const lws of state.listeners) {
      safeSend(lws, { type: "flac-host-ended" });
    }
    await endRoomInDb(code);
    logger.info({ code }, "flac host detached");
  });
}

async function attachFlacListener(ws: WebSocket, code: string): Promise<void> {
  const flacHost = flacHosts.get(code);
  if (!flacHost) {
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.code, code));
    if (!room) {
      safeSend(ws, { type: "error", error: "room not found" });
    } else {
      safeSend(ws, { type: "error", error: "flac-host offline" });
    }
    ws.close();
    return;
  }

  flacHost.listeners.add(ws);
  safeSend(ws, { type: "joined", role: "flac-listener" });

  const count = flacHost.listeners.size;
  safeSend(flacHost.ws, { type: "flac-listener-count", count });

  ws.on("close", () => {
    const h = flacHosts.get(code);
    if (!h) return;
    h.listeners.delete(ws);
    const listenerCount = h.listeners.size;
    safeSend(h.ws, { type: "flac-listener-count", count: listenerCount });
  });
}

export function attachSignaling(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    if (!url.startsWith("/ws")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const helloTimeout = setTimeout(() => {
      try {
        safeSend(ws, { type: "error", error: "hello timeout" });
        ws.close();
      } catch {
        // ignore
      }
    }, 5000);

    ws.once("message", (raw: RawData) => {
      clearTimeout(helloTimeout);

      let helloJson: unknown;
      try {
        helloJson = JSON.parse(raw.toString());
      } catch {
        safeSend(ws, { type: "error", error: "invalid hello" });
        ws.close();
        return;
      }

      const hello = helloJson as { type: string; code?: string; hostToken?: string };
      logger.info({ hello }, "received hello message");
      if (!hello || typeof hello.code !== "string") {
        safeSend(ws, { type: "error", error: "invalid hello" });
        ws.close();
        return;
      }

      if (hello.type === "host") {
        void attachHost(ws, hello.code, hello.hostToken ?? "");
      } else if (hello.type === "listener") {
        void attachListener(ws, hello.code);
      } else if (hello.type === "flac-host-connect") {
        void attachFlacHost(ws, hello.code, hello.hostToken ?? "");
      } else if (hello.type === "flac-listener") {
        void attachFlacListener(ws, hello.code);
      } else {
        safeSend(ws, { type: "error", error: "unknown role" });
        ws.close();
      }
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "ws error");
    });
  });

  // Heartbeat: ping all sockets every 30s; close dead ones.
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.ping();
        } catch {
          // ignore
        }
      }
    }
  }, 30000);
  wss.on("close", () => clearInterval(interval));
}
