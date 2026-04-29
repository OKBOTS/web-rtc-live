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

const hosts: Map<string, HostState> = new Map();

export function getLiveStats(): { liveNow: number; listenersConnected: number } {
  let listeners = 0;
  for (const h of hosts.values()) {
    listeners += h.listeners.size;
  }
  return { liveNow: hosts.size, listenersConnected: listeners };
}

export function getRoomLiveInfo(code: string): { isLive: boolean; listenerCount: number } {
  const h = hosts.get(code);
  if (!h) return { isLive: false, listenerCount: 0 };
  return { isLive: true, listenerCount: h.listeners.size };
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
      let hello: IncomingHello | undefined;
      try {
        hello = JSON.parse(raw.toString()) as IncomingHello;
      } catch {
        safeSend(ws, { type: "error", error: "invalid hello" });
        ws.close();
        return;
      }
      if (!hello || typeof hello.code !== "string") {
        safeSend(ws, { type: "error", error: "invalid hello" });
        ws.close();
        return;
      }
      if (hello.type === "host") {
        void attachHost(ws, hello.code, hello.hostToken);
      } else if (hello.type === "listener") {
        void attachListener(ws, hello.code);
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
