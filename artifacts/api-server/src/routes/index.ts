import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { roomsRouter } from "./rooms";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(roomsRouter);
router.use(statsRouter);

export default router;
