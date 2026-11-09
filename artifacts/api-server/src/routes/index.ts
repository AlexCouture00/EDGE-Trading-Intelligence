import { Router, type IRouter } from "express";
import healthRouter from "./health";
import edgeRouter from "./edge";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/edge", edgeRouter);

export default router;
