import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, accounts, confluences, settings, trades, strategies } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { CreateTradeBody } from "@workspace/api-zod";
import { saveTrade } from "./trade-service";
import { initializeOwner, loadTrades } from "./edge-data";

test("persisted trade service: drafts, ownership, original risk, historical confluences, partial fills", async (t) => {
  const owner = `edge-test-${randomUUID()}`, other = `edge-test-${randomUUID()}`;
  try {
    await initializeOwner(owner);
    await initializeOwner(other);
    const [a, b] = await db.insert(accounts).values([
      { ownerId: owner, name: "Test USD", currency: "USD", initialBalance: "1000", type: "backtesting" },
      { ownerId: other, name: "Other owner", currency: "EUR", initialBalance: "2000", type: "backtesting" },
    ]).returning();
    const [conf] = await db.select().from(confluences).where(eq(confluences.ownerId, owner)).limit(1);
    const [foreignConf] = await db.select().from(confluences).where(eq(confluences.ownerId, other)).limit(1);
    const base = {
      accountId: a!.id, status: "closed", symbol: "XAUUSD", assetClass: "metals", direction: "long",
      entryAt: "2026-01-01T10:00:00Z", exitAt: "2026-01-02T10:00:00Z",
      entryPrice: "2000", exitPrice: "2010", quantity: "0.1", initialRisk: "100",
      grossPnl: "100", commission: "5", pnlSource: "broker", confluenceIds: [conf!.id],
    };
    let draft = "";
    await t.test("a draft permits incomplete data and can become an open trade", async () => {
      draft = await saveTrade(owner, CreateTradeBody.parse({ accountId: a!.id, status: "draft" }));
      const rows = await loadTrades(owner);
      assert.equal(rows.find((r) => r.id === draft)!.netPnl, null);
      await saveTrade(owner, CreateTradeBody.parse({ ...base, status: "open", exitAt: null }), draft);
    });
    await t.test("original risk stays locked after entry, even when a stop changes", async () => {
      await assert.rejects(saveTrade(owner, CreateTradeBody.parse({ ...base, initialRisk: "200" }), draft), /risk is locked/);
      await saveTrade(owner, CreateTradeBody.parse({ ...base, stopLoss: "1995" }), draft);
      const row = (await loadTrades(owner)).find((r) => r.id === draft)!;
      assert.equal(row.realizedR, "0.95000000");
      assert.equal(row.initialRisk, "100.00000000");
    });
    await t.test("historical associations survive rename and archive", async () => {
      const original = conf!.name;
      await db.update(confluences).set({ name: "New display name", archived: true }).where(eq(confluences.id, conf!.id));
      await saveTrade(owner, CreateTradeBody.parse({ ...base, lesson: "Review changed" }), draft);
      const row = (await loadTrades(owner)).find((r) => r.id === draft)!;
      assert.equal(row.confluences[0]!.name, original);
      await assert.rejects(saveTrade(owner, CreateTradeBody.parse(base)), /inactive/);
    });
    await t.test("full edit can clear optional psychology fields", async () => {
      await saveTrade(owner, CreateTradeBody.parse({ ...base, grade: "A", confidence: 5, followedPlan: true }), draft);
      await saveTrade(owner, CreateTradeBody.parse(base), draft);
      const row = (await loadTrades(owner)).find((r) => r.id === draft)!;
      assert.equal(row.grade, undefined);
      assert.equal(row.confidence, undefined);
      assert.equal(row.followedPlan, undefined);
    });
    await t.test("cross-owner accounts, associations and updates are refused", async () => {
      await assert.rejects(saveTrade(owner, CreateTradeBody.parse({ ...base, accountId: b!.id, confluenceIds: [] })), /account not found/);
      await assert.rejects(saveTrade(owner, CreateTradeBody.parse({ ...base, confluenceIds: [foreignConf!.id] })), /do not belong/);
      await assert.rejects(saveTrade(other, CreateTradeBody.parse({ ...base, accountId: b!.id, confluenceIds: [] }), draft), /Trade not found/);
      assert.equal((await loadTrades(other)).length, 0);
    });
    await t.test("partial exits form one trade with weighted prices and per-fill fees", async () => {
      const id = await saveTrade(owner, CreateTradeBody.parse({
        ...base, confluenceIds: [], pnlSource: "calculated", multiplier: "1", commission: "0",
        executions: [
          { kind: "entry", price: "100", quantity: "2", timestamp: "2026-01-01T10:00:00Z", fee: "1" },
          { kind: "exit", price: "110", quantity: "1", timestamp: "2026-01-01T12:00:00Z", fee: "0.5" },
          { kind: "exit", price: "90", quantity: "1", timestamp: "2026-01-02T10:00:00Z", fee: "0.5" },
        ],
      }));
      const row = (await loadTrades(owner)).find((r) => r.id === id)!;
      assert.equal(row.executions.length, 3); assert.equal(row.netPnl, "-2.00000000"); assert.equal(row.realizedR, "-0.02000000");
    });
    await t.test("bad execution totals and incomplete calculated contracts are rejected", async () => {
      await assert.rejects(saveTrade(owner, CreateTradeBody.parse({
        ...base, confluenceIds: [], pnlSource: "calculated", multiplier: null,
      })), /multiplier/);
      await assert.rejects(saveTrade(owner, CreateTradeBody.parse({
        ...base, confluenceIds: [], executions: [
          { kind: "entry", price: "100", quantity: "1", timestamp: "2026-01-01T10:00:00Z" },
          { kind: "exit", price: "110", quantity: "2", timestamp: "2026-01-02T10:00:00Z" },
        ],
      })), /exceed/);
    });
    await t.test("zero risk remains unavailable and fees can change a gross winner into a loss", async () => {
      const id = await saveTrade(owner, CreateTradeBody.parse({ ...base, confluenceIds: [], initialRisk: "0", grossPnl: "1", commission: "2" }));
      const row = (await loadTrades(owner)).find((r) => r.id === id)!;
      assert.equal(row.netPnl, "-1.00000000"); assert.equal(row.realizedR, null);
    });
    await t.test("delete cascades only this trade's executions and confluence links", async () => {
      await db.delete(trades).where(eq(trades.id, draft));
      assert.equal((await loadTrades(owner)).some((r) => r.id === draft), false);
      assert.equal((await loadTrades(owner)).length, 2);
    });
  } finally {
    // Only uniquely named synthetic owners created by this test are touched.
    await db.delete(trades).where(inArray(trades.ownerId, [owner, other]));
    await db.delete(accounts).where(inArray(accounts.ownerId, [owner, other]));
    await db.delete(confluences).where(inArray(confluences.ownerId, [owner, other]));
    await db.delete(strategies).where(inArray(strategies.ownerId, [owner, other]));
    await db.delete(settings).where(inArray(settings.ownerId, [owner, other]));
    await pool.end();
  }
});
