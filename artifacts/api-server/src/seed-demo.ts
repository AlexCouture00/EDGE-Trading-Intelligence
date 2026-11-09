import { db, pool, accounts, strategies, confluences, trades, executions, tradeConfluences } from "@workspace/db";
import { eq } from "drizzle-orm";
import { initializeOwner, DEMO_OWNER } from "./lib/edge-data";
import { D, money, netResult, realizedR } from "./lib/calculations";
import { logger } from "./lib/logger";

// Explicit development command only, never part of application startup/publish.
await initializeOwner(DEMO_OWNER);
await db.transaction(async (tx) => {
  const existing = await tx.select().from(accounts).where(eq(accounts.ownerId, DEMO_OWNER));
  if (existing.length) return;
  const [account] = await tx.insert(accounts).values({
    ownerId: DEMO_OWNER, name: "Swing Trading", broker: "Demo broker", currency: "USD", type: "demo", initialBalance: "25000",
  }).returning();
  const strats = await tx.insert(strategies).values([
    { ownerId: DEMO_OWNER, name: "Trend Continuation", description: "Trade pullbacks into a higher-timeframe trend.", entryRules: "Higher-timeframe alignment; retracement to a key level; clear rejection.", exitRules: "Take profit at the next structural level or on invalidation.", riskRules: "Risk at most 1% per trade. Do not widen the initial stop.", timeframe: "H4" },
    { ownerId: DEMO_OWNER, name: "Liquidity Reversal", description: "Wait for liquidity to be swept before entering a confirmed reversal.", entryRules: "Sweep of a previous high/low, followed by a break in structure.", exitRules: "Exit at opposing liquidity or stop on structural invalidation.", riskRules: "Risk 0.5% to 1%. Never average into a loser.", timeframe: "H1" },
  ]).returning();
  const cs = await tx.select().from(confluences).where(eq(confluences.ownerId, DEMO_OWNER));
  cs.sort((a, b) => a.sortOrder - b.sortOrder);
  const results = [1.8, -1, 2.4, 1.2, -1, 3.1, 0, -0.8, 2.2, 1.4, -1, 2.7, 1.1, -1, 2.3, 0.6, -1, 3.4, 1.8, -0.7, 2.1, -1, 1.5, 2.9, -1, 0, 2.6, 1.3, -1, 2.2, 1.7, -0.9, 3.2, -1, 1.9, 2.5];
  const now = new Date();
  const base = new Date(now.getTime() - 108 * 86400000);
  base.setUTCHours(9, 30, 0, 0);
  for (let i = 0; i < results.length; i++) {
    const entryAt = new Date(base.getTime() + i * 2.8 * 86400000);
    const exitAt = new Date(entryAt.getTime() + (12 + (i % 5) * 6) * 3600000);
    const symbol = ["XAUUSD", "EURUSD", "XAUUSD", "GBPUSD", "US100"][i % 5]!;
    const risk = "250", net = money(D(results[i]!).mul(risk)), gross = money(D(net).plus("7.5"));
    const direction = i % 3 === 0 ? "short" : "long";
    const entry = symbol === "XAUUSD" ? D(2680).plus(i * 4) : symbol === "US100" ? D(20500).plus(i * 10) : D("1.08").plus(D(i).div(1000));
    const quantity = symbol === "XAUUSD" ? "0.5" : symbol === "US100" ? "1" : "0.1";
    const multiplier = symbol === "XAUUSD" ? "100" : symbol === "US100" ? "1" : "100000";
    const delta = D(gross).div(D(quantity).mul(multiplier));
    const [trade] = await tx.insert(trades).values({
      ownerId: DEMO_OWNER, accountId: account!.id, strategyId: strats[i % 2]!.id,
      symbol, assetClass: symbol === "XAUUSD" ? "metals" : symbol === "US100" ? "indices" : "forex",
      status: "closed", direction, entryAt, exitAt, entryPrice: money(entry),
      exitPrice: money(entry.plus(delta.mul(direction === "short" ? -1 : 1))), quantity, multiplier,
      stopLoss: money(entry.minus(D(risk).div(D(quantity).mul(multiplier)).mul(direction === "short" ? -1 : 1))),
      initialRisk: risk, grossPnl: gross, commission: "7.5", pnlSource: "broker",
      netPnl: netResult(gross, "7.5"), realizedR: realizedR(net, risk), timeframe: i % 2 ? "H1" : "H4",
      higherTimeframe: "D1", regime: i % 4 === 0 ? "Ranging" : "Trending", session: i % 3 ? "London" : "New York",
      emotion: i % 6 === 0 ? "Anxious" : "Calm", confidence: i % 4 + 2, grade: i % 6 === 0 ? "C" : "A",
      followedPlan: i % 6 !== 0, behavioralTags: i % 6 === 0 ? ["Early exit"] : [],
      thesis: "DEMO EXAMPLE — Higher-timeframe structure aligned with a retracement into a key level.",
      entryReason: "Price rejected the marked level with confirmation on the entry timeframe.",
      management: "Maintained the initial risk and followed the planned invalidation.",
      exitReason: "Planned target or stop reached.", wentWell: "Waited for a confirmed setup.",
      wentWrong: i % 6 === 0 ? "Exited before the planned structural level." : "",
      lesson: "DEMO EXAMPLE — Grade execution independently of the trade outcome.",
    }).returning();
    const indices = [...new Set([4, i % 10, (i + 3) % 10, ...(i % 3 === 0 ? [8] : [])])];
    await tx.insert(tradeConfluences).values(indices.map((j) => ({
      tradeId: trade!.id, confluenceId: cs[j]!.id, nameSnapshot: cs[j]!.name,
      descriptionSnapshot: cs[j]!.description, categorySnapshot: cs[j]!.category, colorSnapshot: cs[j]!.color,
    })));
    await tx.insert(executions).values([
      { tradeId: trade!.id, kind: "entry", price: trade!.entryPrice!, quantity, timestamp: entryAt },
      { tradeId: trade!.id, kind: "exit", price: trade!.exitPrice!, quantity, timestamp: exitAt },
    ]);
  }
});
logger.info("Isolated read-only demo dataset is ready");
await pool.end();
