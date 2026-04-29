import { Router, type IRouter } from "express";
import { db, roomsTable } from "@workspace/db";
import { GetStatsResponse } from "@workspace/api-zod";
import { getLiveStats } from "../lib/signaling";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const all = await db.select({ code: roomsTable.code }).from(roomsTable);
  const live = getLiveStats();
  const data = GetStatsResponse.parse({
    totalBroadcasts: all.length,
    liveNow: live.liveNow,
    listenersConnected: live.listenersConnected,
  });
  res.json(data);
});

export default router;
