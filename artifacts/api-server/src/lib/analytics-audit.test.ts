import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { ZodError } from "zod";
import { db, pool, accounts, cashFlows, confluences, settings, trades, strategies, executions, tradeConfluences } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateTradeBody, GetAnalyticsResponse } from "@workspace/api-zod";
import analyticsRouter from "../routes/edge-analytics";
import { initializeOwner } from "./edge-data";
import { saveTrade } from "./trade-service";

test("PostgreSQL analytics audit: confluences, currencies, cash flows, edit/delete recalculation", async (t) => {
  const owner = `edge-audit-${randomUUID()}`;
  // Test-only in-process router harness, not mounted in the running application.
  const app = express();
  app.use((_req, res, next) => { res.locals.ownerId = owner; res.locals.isDemo = false; next(); });
  app.use(analyticsRouter);
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err instanceof ZodError ? 400 : err.status ?? 500).json({ error: err.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const get = async (params: Record<string, string> = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/analytics?${new URLSearchParams(params)}`);
    assert.equal(res.status, 200, await res.clone().text());
    return GetAnalyticsResponse.parse(await res.json());
  };
  try {
    await initializeOwner(owner);
    const [account] = await db.insert(accounts).values({ ownerId: owner, name: "Audit USD", currency: "USD", initialBalance: "1000", type: "backtesting" }).returning();
    const cs = await db.select().from(confluences).where(eq(confluences.ownerId, owner));
    const a = cs[0]!.id, b = cs[1]!.id, c = cs[2]!.id;
    const base = {
      accountId: account!.id, status: "closed", symbol: "XAUUSD", assetClass: "metals", direction: "long",
      entryAt: "2026-01-01T09:00:00Z", exitAt: "2026-01-01T15:00:00Z", entryPrice: "100",
      exitPrice: "110", quantity: "1", initialRisk: "100", pnlSource: "broker", grossPnl: "200",
      commission: "0", confluenceIds: [a, b],
    };
    const first = await saveTrade(owner, CreateTradeBody.parse(base));
    await saveTrade(owner, CreateTradeBody.parse({ ...base, symbol: "EURUSD", grossPnl: "-100", confluenceIds: [a, b, c], exitAt: "2026-01-03T15:00:00Z" }));
    await saveTrade(owner, CreateTradeBody.parse({ ...base, symbol: "US100", grossPnl: "0", initialRisk: null, confluenceIds: [], exitAt: "2026-01-04T15:00:00Z" }));
    await db.insert(cashFlows).values([
      { ownerId: owner, accountId: account!.id, type: "deposit", amount: "500", date: new Date("2026-01-02T00:00:00Z") },
      { ownerId: owner, accountId: account!.id, type: "withdrawal", amount: "200", date: new Date("2026-01-05T00:00:00Z") },
    ]);
    await t.test("individual and combination statistics distinguish exact from contains-all", async () => {
      const all = await get({ minSample: "1", matchMode: "exact" });
      assert.equal(all.metrics.totalTrades, 3);
      assert.equal(all.metrics.netPnl, "100.00000000");
      assert.equal(all.metrics.winRate, 50);
      assert.equal(all.metrics.averageR, 0.5);
      assert.equal(all.metrics.profitFactor, 2);
      assert.equal(all.metrics.rSample, 2);
      assert.equal(all.byInstrument.length, 3);
      assert.equal(all.confluences.find((g) => g.id === a)!.totalTrades, 2);
      const exact = await get({ confluenceIds: [a, b].join(","), matchMode: "exact", minSample: "1" });
      const contains = await get({ confluenceIds: [a, b].join(","), matchMode: "containsAll", minSample: "1" });
      assert.equal(exact.metrics.totalTrades, 1);
      assert.equal(exact.metrics.netPnl, "200.00000000");
      assert.equal(contains.metrics.totalTrades, 2);
      assert.equal(contains.metrics.netPnl, "100.00000000");
      assert.equal(exact.combinations.find((g) => g.confluenceIds?.length === 2)!.sampleWarning, true);
      assert.ok(contains.warnings.some((w) => w.includes("Small sample")));
    });
    await t.test("session performance uses filtered closed trades and preserves historical sessions", async () => {
      const [sessionAccount] = await db.insert(accounts).values({
        ownerId: owner, name: "Session audit", currency: "USD", initialBalance: "1000", type: "backtesting",
      }).returning();
      const saved: string[] = [];
      try {
        const fixtures = [
          { session: "London", grossPnl: "100", initialRisk: "100" },
          { session: "London", grossPnl: "-50", initialRisk: "100" },
          { session: "Asia", grossPnl: "200", initialRisk: null },
          { session: "New York", grossPnl: "0", initialRisk: "100" },
          { session: "London/NY overlap", grossPnl: "-25", initialRisk: "25" },
          { session: "   ", grossPnl: "50", initialRisk: "50" },
          { session: "Sydney", grossPnl: "75", initialRisk: "25" },
        ];
        for (const [i, fixture] of fixtures.entries()) {
          saved.push(await saveTrade(owner, CreateTradeBody.parse({
            ...base, ...fixture, accountId: sessionAccount!.id, confluenceIds: [],
            exitAt: `2026-01-0${i + 1}T15:00:00Z`,
          })));
        }
        saved.push(await saveTrade(owner, CreateTradeBody.parse({
          ...base, accountId: sessionAccount!.id, session: "Open only", status: "open",
          exitAt: null, exitPrice: null, confluenceIds: [],
        })));
        const all = await get({ accountId: sessionAccount!.id });
        assert.equal(all.metrics.totalTrades, 7);
        assert.equal(all.bySession.length, 6);
        assert.equal(all.bySession.reduce((n, g) => n + g.totalTrades, 0), 7);
        assert.equal(all.bySession.some((g) => g.name === "Open only"), false);
        const london = all.bySession.find((g) => g.id === "London")!;
        assert.equal(london.totalTrades, 2);
        assert.equal(london.netPnl, "50.00000000");
        assert.equal(london.winRate, 50);
        assert.equal(london.averageR, 0.25);
        assert.equal(london.totalR, 0.5);
        assert.equal(london.profitFactor, 2);
        assert.equal(london.sampleWarning, true);
        const asia = all.bySession.find((g) => g.id === "Asia")!;
        assert.equal(asia.rSample, 0);
        assert.equal(asia.averageR, null);
        assert.equal(all.bySession.find((g) => g.id === "New York")!.totalR, 0);
        assert.equal(all.bySession.find((g) => g.id === "London/NY overlap")!.totalR, -1);
        assert.equal(all.bySession.find((g) => g.id === "Not recorded")!.totalTrades, 1);
        assert.equal(all.bySession.find((g) => g.id === "Sydney")!.totalR, 3);
        const filtered = await get({ accountId: sessionAccount!.id, to: "2026-01-01T23:59:59.999Z" });
        assert.equal(filtered.bySession.length, 1);
        assert.equal(filtered.bySession[0]!.name, "London");
        assert.equal(filtered.bySession[0]!.totalR, 1);
        const empty = await get({ accountId: sessionAccount!.id, from: "2027-01-01T00:00:00Z" });
        assert.deepEqual(empty.bySession, []);
      } finally {
        for (const id of saved) await db.delete(trades).where(eq(trades.id, id));
        await db.delete(accounts).where(eq(accounts.id, sessionAccount!.id));
      }
    });
    await t.test("archived confluences disappear from individual results without losing historical links", async () => {
      const before = await get({ minSample: "1" });
      assert.equal(before.confluences.find((row) => row.id === a)!.totalTrades, 2);
      const linksBefore = await db.select().from(tradeConfluences)
        .where(eq(tradeConfluences.confluenceId, a)).orderBy(tradeConfluences.tradeId);
      assert.ok(linksBefore.length > 0, "The archived confluence must have historical trade links");
      await db.update(confluences).set({ archived: true }).where(eq(confluences.id, a));
      try {
        const archived = await get({ minSample: "1" });
        assert.equal(archived.confluences.some((row) => row.id === a), false);
        assert.equal(archived.confluences.some((row) => row.id === b), true);
        assert.deepEqual(archived.metrics, before.metrics);
        assert.deepEqual(archived.combinations, before.combinations);
        const linksAfter = await db.select().from(tradeConfluences)
          .where(eq(tradeConfluences.confluenceId, a)).orderBy(tradeConfluences.tradeId);
        assert.deepEqual(linksAfter, linksBefore);
      } finally {
        await db.update(confluences).set({ archived: false }).where(eq(confluences.id, a));
      }
      const restored = await get({ minSample: "1" });
      assert.deepEqual(restored.confluences.find((row) => row.id === a),
        before.confluences.find((row) => row.id === a));
    });
    await t.test("strategy IDs connect cards to table metrics and preserve zero R, renames and filters", async () => {
      const created = await db.insert(strategies).values([
        { ownerId: owner, name: "Mean Reversion" },
        { ownerId: owner, name: "Momentum" },
        { ownerId: owner, name: "Mean Reversion" },
      ]).returning();
      const mean = created[0]!, momentum = created[1]!, sameName = created[2]!;
      const saved: string[] = [];
      try {
        for (const input of [
          { strategyId: mean.id, grossPnl: "100", exitAt: "2026-01-01T15:00:00Z" },
          { strategyId: mean.id, grossPnl: "-100", exitAt: "2026-01-03T15:00:00Z" },
          { strategyId: momentum.id, grossPnl: "200", exitAt: "2026-01-01T15:00:00Z" },
          { strategyId: sameName.id, grossPnl: "50", exitAt: "2026-01-01T15:00:00Z" },
        ]) {
          saved.push(await saveTrade(owner, CreateTradeBody.parse({ ...base, ...input })));
        }
        const all = await get();
        const byId = new Map(all.byStrategy.map((row) => [row.id, row]));
        const meanMetrics = byId.get(mean.id)!;
        assert.ok(meanMetrics, "Strategy cards must find metrics using the saved strategy UUID");
        assert.equal(meanMetrics.name, "Mean Reversion");
        assert.equal(meanMetrics.totalTrades, 2);
        assert.equal(meanMetrics.rSample, 2);
        assert.equal(meanMetrics.averageR, 0);
        assert.equal(meanMetrics.totalR, 0);
        assert.equal(byId.get(momentum.id)!.averageR, 2);
        assert.equal(byId.get(momentum.id)!.totalR, 2);
        assert.equal(byId.get(sameName.id)!.averageR, 0.5);
        assert.equal(all.byStrategy.filter((row) => row.name === "Mean Reversion").length, 2);
        const filtered = await get({ strategyId: mean.id, accountId: account!.id, from: "2026-01-02T00:00:00Z" });
        assert.equal(filtered.byStrategy.length, 1);
        assert.equal(filtered.byStrategy[0]!.id, mean.id);
        assert.equal(filtered.byStrategy[0]!.averageR, -1);
        assert.equal(filtered.byStrategy[0]!.totalR, -1);
        await db.update(strategies).set({ name: "Renamed Mean Reversion" }).where(eq(strategies.id, mean.id));
        const renamed = (await get()).byStrategy.find((row) => row.id === mean.id)!;
        assert.equal(renamed.name, "Renamed Mean Reversion");
        assert.equal(renamed.averageR, 0);
        assert.equal(renamed.totalR, 0);
      } finally {
        for (const id of saved) await db.delete(trades).where(eq(trades.id, id));
        for (const strategy of created) await db.delete(strategies).where(eq(strategies.id, strategy.id));
      }
    });
    await t.test("journal curves exclude capital and cash flows; selected-period P&L starts at zero", async () => {
      const all = await get();
      assert.equal(all.equity.at(-1)!.balance, 100);
      assert.equal(all.equity.at(-1)!.pnl, 100);
      assert.equal(all.equity.at(-1)!.cumulativeR, 1);
      assert.equal(all.equity.at(-1)!.drawdown, 100);
      assert.equal(all.metrics.maxDrawdown, "100.00000000");
      const period = await get({ from: "2026-01-03T00:00:00Z", to: "2026-01-04T23:59:59Z" });
      assert.equal(period.equity[0]!.balance, 0);
      assert.equal(period.equity.at(-1)!.balance, -100);
      assert.equal(period.metrics.netPnl, "-100.00000000");
      const untagged = await get({ confluenceIds: "", matchMode: "exact" });
      assert.equal(untagged.metrics.totalTrades, 1);
      assert.equal(untagged.equity.at(-1)!.balance, 0);
      assert.equal(all.metrics.maxDrawdownPercent, null);
      assert.ok(untagged.warnings.some((w) => w.includes("measured in R")));
    });
    await t.test("date filters preserve millisecond boundaries and reject invalid/reversed dates", async () => {
      const afterExit = await get({ from: "2026-01-01T15:00:00.001Z" });
      assert.equal(afterExit.metrics.totalTrades, 2);
      const atExit = await get({ from: "2026-01-01T15:00:00.000Z" });
      assert.equal(atExit.metrics.totalTrades, 3);
      const invalid = await fetch(`http://127.0.0.1:${port}/analytics?from=not-a-date`);
      assert.equal(invalid.status, 400);
      const reversed = await fetch(`http://127.0.0.1:${port}/analytics?from=2026-02-01&to=2026-01-01`);
      assert.equal(reversed.status, 400);
    });
    await t.test("persisted edits refresh all aggregate outcomes, delete cascades associations", async () => {
      await saveTrade(owner, CreateTradeBody.parse({ ...base, grossPnl: "-50", confluenceIds: [c] }), first);
      const edited = await get();
      assert.equal(edited.metrics.netPnl, "-150.00000000");
      assert.equal(edited.metrics.winRate, 0);
      assert.equal(edited.confluences.find((g) => g.id === a)!.totalTrades, 1);
      assert.equal(edited.confluences.find((g) => g.id === c)!.totalTrades, 2);
      await db.delete(trades).where(eq(trades.id, first));
      assert.equal((await db.select().from(executions).where(eq(executions.tradeId, first))).length, 0);
      assert.equal((await db.select().from(tradeConfluences).where(eq(tradeConfluences.tradeId, first))).length, 0);
      const removed = await get();
      assert.equal(removed.metrics.totalTrades, 2);
      assert.equal(removed.metrics.netPnl, "-100.00000000");
      assert.equal(removed.equity.at(-1)!.balance, -100);
    });
    await t.test("cross-currency totals require a currency or legacy account scope, never assumed FX", async () => {
      await db.insert(accounts).values({ ownerId: owner, name: "Audit EUR", currency: "EUR", initialBalance: "1000", type: "backtesting" });
      assert.equal((await fetch(`http://127.0.0.1:${port}/analytics`)).status, 400);
      assert.equal((await get({ accountId: account!.id })).currency, "USD");
      assert.equal((await get({ currency: "USD" })).metrics.netPnl, "-100.00000000");
      assert.equal((await get({ currency: "EUR" })).metrics.totalTrades, 0);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await db.delete(trades).where(eq(trades.ownerId, owner));
    await db.delete(cashFlows).where(eq(cashFlows.ownerId, owner));
    await db.delete(accounts).where(eq(accounts.ownerId, owner));
    await db.delete(confluences).where(eq(confluences.ownerId, owner));
    await db.delete(strategies).where(eq(strategies.ownerId, owner));
    await db.delete(settings).where(eq(settings.ownerId, owner));
    await pool.end();
  }
});
