import { Router, type IRouter } from "express";
import healthRouter from "./health";
import edgeRouter from "./edge";
import { privateAuth } from "../lib/private-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.get("/auth/session", privateAuth, (_req, res) => { res.json(res.locals.authUser); });
router.use("/edge", privateAuth, edgeRouter);

export default router;
