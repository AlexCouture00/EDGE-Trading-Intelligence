import { Router, type IRouter } from "express";
import { edgeIdentity } from "../lib/edge-data";
import catalog from "./edge-catalog";
import journal from "./edge-trades";
import analytics from "./edge-analytics";
import dayNotes from "./edge-day-notes";
import propManager from "./edge-prop-manager";

const router: IRouter = Router();
router.use(edgeIdentity);
router.use(catalog, journal, analytics, dayNotes, propManager);
export default router;
