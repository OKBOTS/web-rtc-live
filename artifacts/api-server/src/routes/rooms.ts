import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { desc, eq, isNull } from "drizzle-orm";
import { db, roomsTable } from "@workspace/db";
import {
  CreateRoomBody,
  GetRoomParams,
  EndRoomParams,
  EndRoomBody,
  ListRoomsResponse,
  GetRoomResponse,
  EndRoomResponse,
} from "@workspace/api-zod";
import { getRoomLiveInfo, hashToken } from "../lib/signaling";

const router: IRouter = Router();

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    const byte = bytes[i] ?? 0;
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function generateHostToken(): string {
  return randomBytes(24).toString("base64url");
}

function serializeRoom(row: typeof roomsTable.$inferSelect) {
  const live = getRoomLiveInfo(row.code);
  return {
    code: row.code,
    title: row.title,
    hostName: row.hostName,
    sourceType: row.sourceType,
    isLive: live.isLive && row.endedAt == null,
    listenerCount: live.listenerCount,
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  };
}

router.get("/rooms", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(roomsTable)
    .orderBy(desc(roomsTable.createdAt))
    .limit(60);

  const data = rows.map(serializeRoom);
  // live first
  data.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  const sliced = data.slice(0, 30);
  res.json(ListRoomsResponse.parse(sliced));
});

router.post("/rooms", async (req, res): Promise<void> => {
  const parsed = CreateRoomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Generate a unique code (retry a few times in extremely unlikely collision case)
  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateRoomCode();
    const [existing] = await db
      .select({ code: roomsTable.code })
      .from(roomsTable)
      .where(eq(roomsTable.code, code));
    if (!existing) break;
    code = "";
  }
  if (!code) {
    res.status(500).json({ error: "could not allocate room code" });
    return;
  }

  const hostToken = generateHostToken();
  const [row] = await db
    .insert(roomsTable)
    .values({
      code,
      title: parsed.data.title,
      hostName: parsed.data.hostName,
      sourceType: parsed.data.sourceType,
      hostTokenHash: hashToken(hostToken),
    })
    .returning();

  if (!row) {
    res.status(500).json({ error: "failed to create room" });
    return;
  }

  res.status(201).json({
    room: serializeRoom(row),
    hostToken,
  });
});

router.get("/rooms/:code", async (req, res): Promise<void> => {
  const params = GetRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.code, params.data.code));
  if (!row) {
    res.status(404).json({ error: "room not found" });
    return;
  }
  res.json(GetRoomResponse.parse(serializeRoom(row)));
});

router.post("/rooms/:code/end", async (req, res): Promise<void> => {
  const params = EndRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = EndRoomBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.code, params.data.code));
  if (!row) {
    res.status(404).json({ error: "room not found" });
    return;
  }
  if (row.hostTokenHash !== hashToken(body.data.hostToken)) {
    res.status(401).json({ error: "invalid host token" });
    return;
  }

  const [updated] = await db
    .update(roomsTable)
    .set({ endedAt: new Date() })
    .where(eq(roomsTable.code, params.data.code))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "room not found" });
    return;
  }

  res.json(EndRoomResponse.parse(serializeRoom(updated)));
});

export { router as roomsRouter, generateRoomCode };

// Helper used by stats route.
export async function totalBroadcasts(): Promise<number> {
  const all = await db
    .select({ code: roomsTable.code })
    .from(roomsTable);
  return all.length;
}

export async function endedQuery(): Promise<number> {
  const ended = await db
    .select({ code: roomsTable.code })
    .from(roomsTable)
    .where(isNull(roomsTable.endedAt));
  return ended.length;
}
