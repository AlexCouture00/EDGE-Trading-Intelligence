import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { z, ZodError } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, pool, accounts, cashFlows, confluences, settings, trades } from "@workspace/db";
import { CreateTradeBody, CreateTradeResponse, GetAnalyticsResponse, GetTradeResponse, ListTradesResponse } from "@workspace/api-zod";
import tradesRouter from "../routes/edge-trades";
import analyticsRouter from "../routes/edge-analytics";
import { initializeOwner } from "./edge-data";
import { saveTrade } from "./trade-service";

test("trade-only journal preserves historical links and needs no account setup", async t => {
  const owners = [`journal-test-${randomUUID()}`, `journal-test-${randomUUID()}`];
  const [owner, other] = owners as [string, string];
  // Isolated test-only HTTP harness. Never mounted in the application or deployed.
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.ownerId = req.headers["x-test-user"] === "other" ? other : owner;
    res.locals.isDemo = false;
    next();
  });
  app.use(tradesRouter, analyticsRouter);
  app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof ZodError ? 400 : error.status ?? 500).json({ error: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (path: string, method = "GET", data?: unknown, user = "owner") => fetch(`${origin}${path}`, {
    method, headers: { "content-type": "application/json", "x-test-user": user },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  function get(path: `/analytics${string}`, user?: string): Promise<z.infer<typeof GetAnalyticsResponse>>;
  function get(path: `/trades/${string}`, user?: string): Promise<z.infer<typeof GetTradeResponse>>;
  function get(path: `/trades${string}`, user?: string): Promise<z.infer<typeof ListTradesResponse>>;
  async function get(path: string, user = "owner") {
    const response = await request(path, "GET", undefined, user);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    return path.startsWith("/analytics") ? GetAnalyticsResponse.parse(body)
      : path.startsWith("/trades/") ? GetTradeResponse.parse(body) : ListTradesResponse.parse(body);
  }
  const create = async (data: unknown, user = "owner") => {
    const response = await request("/trades", "POST", data, user);
    assert.equal(response.status, 201, await response.clone().text());
    return CreateTradeResponse.parse(await response.json());
  };
  const base = {
    status: "closed", symbol: "XAUUSD", assetClass: "metals", direction: "long",
    entryAt: "2026-01-01T09:00:00Z", exitAt: "2026-01-01T15:00:00Z",
    entryPrice: "100", exitPrice: "110", quantity: "1", initialRisk: "100",
    pnlSource: "broker", grossPnl: "200", commission: "0", confluenceIds: [],
  };
  try {
    await initializeOwner(owner);
    await initializeOwner(other);
    const [active, archived] = await db.insert(accounts).values([
      { ownerId: owner, name: "Existing live", currency: "USD", initialBalance: "50000", type: "personal_live" },
      { ownerId: owner, name: "Historical evaluation", currency: "USD", initialBalance: "100000", type: "prop_challenge" },
    ]).returning();
    await saveTrade(owner, CreateTradeBody.parse({ ...base, accountId: active.id }));
    const oldTrade = await saveTrade(owner, CreateTradeBody.parse({ ...base, accountId: archived.id, grossPnl: "-50" }));
    await db.update(accounts).set({ archived: true }).where(eq(accounts.id, archived.id));
    await db.insert(cashFlows).values({ ownerId: owner, accountId: active.id, amount: "200000", type: "deposit", date: new Date("2026-01-01") });
    const originalAccounts = await db.select().from(accounts).where(eq(accounts.ownerId, owner));
    const originalFlows = await db.select().from(cashFlows).where(eq(cashFlows.ownerId, owner));
    let newTrade = "";
    let newTradeAccount = "";

    await t.test("all same-currency historical trades remain visible, including archived links", async () => {
      const rows = await get("/trades?currency=USD");
      assert.equal(rows.length, 2);
      assert.ok(rows.some((row: { id: string }) => row.id === oldTrade));
      const report = await get("/analytics?currency=USD");
      assert.equal(report.metrics.netPnl, "150.00000000");
      assert.equal(report.equity[0].pnl, 0);
      const last = report.equity.at(-1);
      assert.ok(last);
      assert.equal(last.pnl, 150);
      assert.equal(last.balance, 150);
      assert.equal(report.metrics.maxDrawdown, "50.00000000");
      assert.equal(report.metrics.maxDrawdownPercent, null);
      assert.deepEqual(await db.select().from(accounts).where(eq(accounts.ownerId, owner)), originalAccounts);
      assert.deepEqual(await db.select().from(cashFlows).where(eq(cashFlows.ownerId, owner)), originalFlows);
    });
    await t.test("concurrent first trades automatically resolve one owner-scoped zero-capital record", async () => {
      const rows = await Promise.all([
        create({ status: "draft", currency: "EUR" }, "other"),
        create({ status: "draft", currency: "EUR" }, "other"),
      ]);
      assert.equal(rows[0].accountId, rows[1].accountId);
      const internal = await db.select().from(accounts).where(eq(accounts.ownerId, other));
      assert.equal(internal.length, 1);
      assert.equal(internal[0].currency, "EUR");
      assert.equal(internal[0].initialBalance, "0.00000000");
      assert.equal((await get("/trades", "other")).length, 2);
    });
    await t.test("a new trade saves and reloads without account input or setup", async () => {
      const row = await create(base); // old API callers may omit currency; defaults to USD.
      newTrade = row.id;
      newTradeAccount = row.accountId;
      // Never silently attribute a new unassigned trade to an old prop-linked account.
      assert.notEqual(row.accountId, active.id);
      assert.notEqual(row.accountId, archived.id);
      const [internal] = await db.select().from(accounts).where(eq(accounts.id, row.accountId));
      assert.equal(internal.initialBalance, "0.00000000");
      assert.equal(internal.broker, "edge-internal-journal");
      assert.equal(row.currency, "USD");
      const reloaded = await get(`/trades/${newTrade}`);
      assert.equal(reloaded.netPnl, "200.00000000");
      assert.equal(reloaded.realizedR, "2.00000000");
    });
    await t.test("editing without account input preserves links and entered-trade currency", async () => {
      const response = await request(`/trades/${newTrade}`, "PUT", { ...base, currency: "USD", grossPnl: "250" });
      assert.equal(response.status, 200, await response.clone().text());
      const before = await get(`/trades/${newTrade}`);
      assert.equal(before.accountId, newTradeAccount);
      assert.equal(before.realizedR, "2.50000000");
      assert.equal((await request(`/trades/${newTrade}`, "PUT", { ...base, currency: "EUR" })).status, 400);
      assert.equal((await request(`/trades/${newTrade}`, "PUT", base, "other")).status, 404);
      assert.deepEqual(await get(`/trades/${newTrade}`), before);
    });
    await t.test("currency scopes include all matching trades and never mix another currency or owner", async () => {
      const cad = await create({ ...base, currency: "CAD", grossPnl: "25" });
      const cadRows = await get("/trades?currency=CAD");
      assert.deepEqual(cadRows.map((row: { id: string }) => row.id), [cad.id]);
      assert.equal((await get("/analytics?currency=CAD")).metrics.netPnl, "25.00000000");
      assert.equal((await get("/analytics?currency=USD")).metrics.netPnl, "400.00000000");
      assert.equal((await get("/analytics?currency=CAD", "other")).metrics.totalTrades, 0);
      assert.equal((await request("/analytics")).status, 400);
    });
    await t.test("invalid or cross-owner requests cannot leave trade or internal-account changes", async () => {
      const before = await db.select().from(accounts).where(inArray(accounts.ownerId, owners));
      assert.equal((await request("/trades", "POST", { status: "closed", currency: "GBP" })).status, 400);
      assert.equal((await request("/trades", "POST", { status: "draft", currency: "usd" })).status, 400);
      assert.equal((await request("/trades", "POST", { status: "draft", accountId: active.id }, "other")).status, 404);
      assert.deepEqual(await db.select().from(accounts).where(inArray(accounts.ownerId, owners)), before);
      assert.equal((await request(`/trades/${newTrade}`, "DELETE", undefined, "other")).status, 404);
      assert.equal((await get(`/trades/${newTrade}`)).netPnl, "250.00000000");
    });
    await t.test("an archived trade stays editable without changing its historical link or account data", async () => {
      const response = await request(`/trades/${oldTrade}`, "PUT", { ...base, grossPnl: "-50", lesson: "Preserved historical review" });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await get(`/trades/${oldTrade}`)).accountId, archived.id);
      const originals = await db.select().from(accounts).where(inArray(accounts.id, originalAccounts.map(row => row.id)));
      assert.deepEqual(originals.sort((a, b) => a.id.localeCompare(b.id)), originalAccounts.sort((a, b) => a.id.localeCompare(b.id)));
      assert.deepEqual(await db.select().from(cashFlows).where(eq(cashFlows.ownerId, owner)), originalFlows);
    });
    await t.test("an all-archived journal can log new trades without reviving old accounts", async () => {
      const [previous] = await db.select().from(accounts).where(eq(accounts.ownerId, other));
      await db.update(accounts).set({ archived: true }).where(eq(accounts.id, previous.id));
      const row = await create({ status: "draft", currency: "EUR" }, "other");
      assert.notEqual(row.accountId, previous.id);
      assert.equal((await get("/trades?currency=EUR", "other")).length, 3);
      const [unchanged] = await db.select().from(accounts).where(eq(accounts.id, previous.id));
      assert.equal(unchanged.archived, true);
      assert.equal((await get("/analytics?currency=EUR", "other")).metrics.totalTrades, 0);
    });
    await t.test("a draft can change currency without changing its identity or another owner's records", async () => {
      const draft = await create({ status: "draft", currency: "EUR" }, "other");
      const response = await request(`/trades/${draft.id}`, "PUT", { status: "draft", currency: "USD" }, "other");
      assert.equal(response.status, 200, await response.clone().text());
      const changed = await get(`/trades/${draft.id}`, "other");
      assert.equal(changed.id, draft.id);
      assert.equal(changed.currency, "USD");
      assert.notEqual(changed.accountId, draft.accountId);
      assert.notEqual(changed.accountId, active.id);
      assert.equal((await get(`/trades/${newTrade}`)).accountId, newTradeAccount);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.delete(trades).where(inArray(trades.ownerId, owners));
    await db.delete(cashFlows).where(inArray(cashFlows.ownerId, owners));
    await db.delete(accounts).where(inArray(accounts.ownerId, owners));
    await db.delete(confluences).where(inArray(confluences.ownerId, owners));
    await db.delete(settings).where(inArray(settings.ownerId, owners));
    await pool.end();
  }
});
