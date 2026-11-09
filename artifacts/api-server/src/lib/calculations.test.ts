import { test } from "node:test";
import assert from "node:assert/strict";
import { netResult, realizedR, linearPnl, summarize, matchesConfluences, equitySeries } from "./calculations";

const trade = (netPnl: string | null, realized: string | null = null, status = "closed", day = 1) => ({
  netPnl, realizedR: realized, status, entryAt: `2026-01-${String(day).padStart(2, "0")}T09:00:00Z`, exitAt: `2026-01-${String(day).padStart(2, "0")}T15:00:00Z`,
});
test("decimal-safe fee accounting and signed funding rebates", () => {
  assert.equal(netResult("0.3", "0.1"), "0.20000000");
  assert.equal(netResult("100", "2", "-1", "3"), "96.00000000");
});
test("linear long and short with explicit contract metadata", () => {
  assert.equal(linearPnl("2000", "2010", "0.5", "100", "long"), "500.00000000");
  assert.equal(linearPnl("2000", "1990", "0.5", "100", "short"), "500.00000000");
  assert.equal(linearPnl("2000", "2010", "0.5", "100", "short"), "-500.00000000");
});
test("R unavailable without original positive monetary risk", () => {
  assert.equal(realizedR("100", "50"), "2.00000000");
  assert.equal(realizedR("-100", "50"), "-2.00000000");
  assert.equal(realizedR("100", "0"), null);
  assert.equal(realizedR("100", null), null);
});
test("empty dataset and zero denominators are unavailable, not invented", () => {
  const m = summarize([]);
  assert.equal(m.netPnl, "0.00000000"); assert.equal(m.winRate, null);
  assert.equal(m.averageR, null); assert.equal(m.profitFactor, null);
  assert.equal(m.maxDrawdownPercent, null);
});
test("win rate excludes breakeven while expectancy includes known-risk breakeven", () => {
  const m = summarize([trade("200", "2", "closed", 1), trade("-100", "-1", "closed", 2), trade("0", "0", "closed", 3)], "1000");
  assert.equal(m.winRate, 50); assert.equal(m.breakeven, 1);
  assert.equal(m.averageR, 1 / 3); assert.equal(m.profitFactor, 2);
  assert.equal(m.maxDrawdown, "100.00000000");
  assert.ok(Math.abs(m.maxDrawdownPercent! - 100 / 1200 * 100) < 1e-8);
});
test("all winners, all losers, and only breakeven", () => {
  const w = summarize([trade("100", "1")]); assert.equal(w.profitFactor, null); assert.equal(w.profitFactorInfinite, true);
  const l = summarize([trade("-100", "-1")]); assert.equal(l.profitFactor, 0); assert.equal(l.winRate, 0);
  const b = summarize([trade("0", "0")]); assert.equal(b.winRate, null); assert.equal(b.averageR, 0); assert.equal(b.profitFactorInfinite, false);
});
test("missing-risk R is excluded; open and draft trades do not affect performance", () => {
  const m = summarize([trade("50", null), trade("100", "2"), trade("999", "999", "open"), trade("999", "999", "draft")]);
  assert.equal(m.totalTrades, 2); assert.equal(m.averageR, 2); assert.equal(m.netPnl, "150.00000000");
});
test("exact matching versus contains all, with zero selections and duplicate IDs", () => {
  assert.equal(matchesConfluences(["a", "b", "c"], ["a", "b"], "exact"), false);
  assert.equal(matchesConfluences(["a", "b", "c"], ["a", "b"], "containsAll"), true);
  assert.equal(matchesConfluences([], [], "exact"), true);
  assert.equal(matchesConfluences(["a"], ["a", "a"], "exact"), true);
});
test("cash deposits and withdrawals change balance, never trading P&L or R", () => {
  const curve = equitySeries([trade("100", "1")], "1000", [
    { date: "2026-01-02T00:00:00Z", type: "deposit", amount: "500" },
    { date: "2026-01-03T00:00:00Z", type: "withdrawal", amount: "200" },
  ]);
  const last = curve.at(-1)!;
  assert.equal(last.balance, 1400); assert.equal(last.pnl, 100); assert.equal(last.cumulativeR, 1); assert.equal(last.drawdown, 0);
});
test("drawdown follows chronological exits, independent of insertion order", () => {
  const rows = [trade("-200", "-2", "closed", 3), trade("100", "1", "closed", 1), trade("-50", "-0.5", "closed", 2)];
  assert.equal(summarize(rows, "1000").maxDrawdown, "250.00000000");
});
