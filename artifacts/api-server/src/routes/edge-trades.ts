import { Router, type IRouter } from "express";
import { db, trades } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { CreateTradeBody, CreateTradeResponse, UpdateTradeBody, UpdateTradeResponse, GetTradeResponse, ListTradesQueryParams, ListTradesResponse } from "@workspace/api-zod";
import { loadTrades, filterTrades, parseId, HttpError } from "../lib/edge-data";
import { saveTrade } from "../lib/trade-service";

const router: IRouter = Router();
router.get("/trades", async (req, res): Promise<void> => {
  // Parse demo separately: z.coerce.boolean treats the string "false" as true.
  const query = ListTradesQueryParams.parse(req.query);
  const rows = filterTrades(await loadTrades(res.locals.ownerId), query);
  rows.sort((a, b) => new Date(b.entryAt ?? b.createdAt).getTime() - new Date(a.entryAt ?? a.createdAt).getTime());
  res.json(ListTradesResponse.parse(rows));
});
router.get("/trades/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const row = (await loadTrades(res.locals.ownerId)).find((t) => t.id === id);
  if (!row) throw new HttpError(404, "Trade not found.");
  res.json(GetTradeResponse.parse(row));
});
router.post("/trades", async (req, res): Promise<void> => {
  const id = await saveTrade(res.locals.ownerId, CreateTradeBody.parse(req.body));
  const row = (await loadTrades(res.locals.ownerId)).find((t) => t.id === id);
  res.status(201).json(CreateTradeResponse.parse(row));
});
router.put("/trades/:id", async (req, res): Promise<void> => {
  const id = await saveTrade(res.locals.ownerId, UpdateTradeBody.parse(req.body), parseId(req.params.id));
  const row = (await loadTrades(res.locals.ownerId)).find((t) => t.id === id);
  res.json(UpdateTradeResponse.parse(row));
});
router.delete("/trades/:id", async (req, res): Promise<void> => {
  const [deleted] = await db.delete(trades).where(and(eq(trades.id, parseId(req.params.id)), eq(trades.ownerId, res.locals.ownerId))).returning({ id: trades.id });
  if (!deleted) throw new HttpError(404, "Trade not found.");
  res.sendStatus(204);
});
export default router;
