import { Router, type IRouter } from "express";
import { db, accounts, cashFlows, confluences, strategies, settings, trades } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  CreateAccountBody, UpdateAccountBody, CreateAccountResponse, ListAccountsResponse, UpdateAccountResponse,
  CreateCashFlowBody, CreateCashFlowResponse, ListCashFlowsResponse,
  CreateConfluenceBody, UpdateConfluenceBody, CreateConfluenceResponse, UpdateConfluenceResponse, ListConfluencesResponse,
  CreateStrategyBody, UpdateStrategyBody, CreateStrategyResponse, UpdateStrategyResponse, ListStrategiesResponse,
  UpdateSettingsBody, GetSettingsResponse, UpdateSettingsResponse,
} from "@workspace/api-zod";
import { D, money } from "../lib/calculations";
import { ownedAccount, parseId, HttpError } from "../lib/edge-data";

const router: IRouter = Router();
function checkDecimal(s: string) {
  const n = D(s);
  if (!n.isFinite() || n.abs().gte("100000000000000000000")) throw new HttpError(400, "Amount exceeds supported precision.");
}
async function accountView(owner: string) {
  const [rows, outcomes, flows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ownerId, owner)),
    db.select().from(trades).where(and(eq(trades.ownerId, owner), eq(trades.status, "closed"))),
    db.select().from(cashFlows).where(eq(cashFlows.ownerId, owner)),
  ]);
  return rows.map((a) => {
    const tradingPnl = outcomes.filter((t) => t.accountId === a.id).reduce((s, t) => s.plus(t.netPnl ?? "0"), D());
    const cash = flows.filter((f) => f.accountId === a.id && f.date <= new Date()).reduce((s, f) => s.plus(D(f.amount).mul(f.type === "withdrawal" ? -1 : 1)), D());
    return { ...a, createdAt: a.createdAt.toISOString(), tradingPnl: money(tradingPnl), balance: money(D(a.initialBalance).plus(tradingPnl).plus(cash)) };
  });
}
router.get("/accounts", async (_req, res): Promise<void> => {
  res.json(ListAccountsResponse.parse(await accountView(res.locals.ownerId)));
});
router.post("/accounts", async (req, res): Promise<void> => {
  const data = CreateAccountBody.parse(req.body); checkDecimal(data.initialBalance);
  if (!data.name.trim()) throw new HttpError(400, "Account name is required.");
  const [row] = await db.insert(accounts).values({ ...data, name: data.name.trim(), ownerId: res.locals.ownerId }).returning();
  if (!row) throw new Error("Account insert failed.");
  res.status(201).json(CreateAccountResponse.parse({ ...row, createdAt: row.createdAt.toISOString(), balance: row.initialBalance, tradingPnl: "0" }));
});
router.patch("/accounts/:id", async (req, res): Promise<void> => {
  const current = await ownedAccount(res.locals.ownerId, parseId(req.params.id));
  const data = UpdateAccountBody.parse(req.body); checkDecimal(data.initialBalance);
  if (!data.name.trim()) throw new HttpError(400, "Account name is required.");
  // Currency and opening capital cannot be retroactively changed once movements exist.
  const [activity] = await db.select({ id: trades.id }).from(trades).where(eq(trades.accountId, current.id)).limit(1);
  const [flow] = await db.select({ id: cashFlows.id }).from(cashFlows).where(eq(cashFlows.accountId, current.id)).limit(1);
  if ((activity || flow) && (data.currency !== current.currency || !D(data.initialBalance).eq(current.initialBalance))) {
    throw new HttpError(400, "Currency and starting balance are locked after account activity. Record a cash adjustment instead.");
  }
  await db.update(accounts).set({ ...data, updatedAt: new Date() }).where(and(eq(accounts.id, current.id), eq(accounts.ownerId, res.locals.ownerId)));
  const rows = await accountView(res.locals.ownerId);
  res.json(UpdateAccountResponse.parse(rows.find((r) => r.id === current.id)));
});
router.get("/accounts/:id/cash-flows", async (req, res): Promise<void> => {
  const a = await ownedAccount(res.locals.ownerId, parseId(req.params.id));
  const rows = await db.select().from(cashFlows).where(and(eq(cashFlows.accountId, a.id), eq(cashFlows.ownerId, res.locals.ownerId))).orderBy(asc(cashFlows.date));
  res.json(ListCashFlowsResponse.parse(rows));
});
router.post("/accounts/:id/cash-flows", async (req, res): Promise<void> => {
  const a = await ownedAccount(res.locals.ownerId, parseId(req.params.id));
  const data = CreateCashFlowBody.parse(req.body); checkDecimal(data.amount);
  if (!D(data.amount).gt(0)) throw new HttpError(400, "Cash flow amount must be positive.");
  if (data.date > new Date()) throw new HttpError(400, "Cash flows cannot be future-dated.");
  const [row] = await db.insert(cashFlows).values({ ...data, accountId: a.id, ownerId: res.locals.ownerId }).returning();
  res.status(201).json(CreateCashFlowResponse.parse(row));
});

router.get("/confluences", async (_req, res): Promise<void> => {
  const rows = await db.select().from(confluences).where(eq(confluences.ownerId, res.locals.ownerId)).orderBy(asc(confluences.sortOrder), asc(confluences.createdAt));
  res.json(ListConfluencesResponse.parse(rows));
});
router.post("/confluences", async (req, res): Promise<void> => {
  const data = CreateConfluenceBody.parse(req.body);
  if (!data.name.trim()) throw new HttpError(400, "Name is required.");
  const [row] = await db.insert(confluences).values({ ...data, name: data.name.trim(), ownerId: res.locals.ownerId }).returning();
  res.status(201).json(CreateConfluenceResponse.parse(row));
});
router.patch("/confluences/:id", async (req, res): Promise<void> => {
  const data = UpdateConfluenceBody.parse(req.body);
  if (!data.name.trim()) throw new HttpError(400, "Name is required.");
  const [row] = await db.update(confluences).set({ ...data, updatedAt: new Date() })
    .where(and(eq(confluences.id, parseId(req.params.id)), eq(confluences.ownerId, res.locals.ownerId))).returning();
  if (!row) throw new HttpError(404, "Confluence not found.");
  res.json(UpdateConfluenceResponse.parse(row));
});
router.get("/strategies", async (_req, res): Promise<void> => {
  res.json(ListStrategiesResponse.parse(await db.select().from(strategies).where(eq(strategies.ownerId, res.locals.ownerId)).orderBy(asc(strategies.createdAt))));
});
router.post("/strategies", async (req, res): Promise<void> => {
  const data = CreateStrategyBody.parse(req.body);
  if (!data.name.trim()) throw new HttpError(400, "Name is required.");
  const [row] = await db.insert(strategies).values({ ...data, ownerId: res.locals.ownerId }).returning();
  res.status(201).json(CreateStrategyResponse.parse(row));
});
router.patch("/strategies/:id", async (req, res): Promise<void> => {
  const data = UpdateStrategyBody.parse(req.body);
  if (!data.name.trim()) throw new HttpError(400, "Name is required.");
  const [row] = await db.update(strategies).set({ ...data, updatedAt: new Date() })
    .where(and(eq(strategies.id, parseId(req.params.id)), eq(strategies.ownerId, res.locals.ownerId))).returning();
  if (!row) throw new HttpError(404, "Strategy not found.");
  res.json(UpdateStrategyResponse.parse(row));
});
router.get("/settings", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settings).where(eq(settings.ownerId, res.locals.ownerId));
  res.json(GetSettingsResponse.parse(row));
});
router.put("/settings", async (req, res): Promise<void> => {
  const data = UpdateSettingsBody.parse(req.body);
  try { new Intl.DateTimeFormat("en", { timeZone: data.timezone }); } catch { throw new HttpError(400, "Select a valid IANA timezone."); }
  if (!D(data.riskLimitPercent).gt(0) || D(data.riskLimitPercent).gt(100)) throw new HttpError(400, "Risk limit must be greater than zero and at most 100%.");
  const [row] = await db.update(settings).set({ ...data, updatedAt: new Date() }).where(eq(settings.ownerId, res.locals.ownerId)).returning();
  res.json(UpdateSettingsResponse.parse(row));
});
export default router;
