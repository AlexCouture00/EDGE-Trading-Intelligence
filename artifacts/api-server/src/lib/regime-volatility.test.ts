import assert from "node:assert/strict";
import test from "node:test";
import { GetAnalyticsResponse } from "@workspace/api-zod";
import { regimeVolatilityAnalytics } from "./regime-volatility";

const trade = (regime: string | null, volatility: string | null, realizedR: string | null, status = "closed") => ({
  regime, volatility, realizedR, status, netPnl: null,
  entryAt: "2026-11-01T10:00:00Z", exitAt: "2026-11-01T11:00:00Z",
});

test("joint cohorts separate each combination and preserve exact R totals", () => {
  const rows = [
    trade("Trend Following", "High", "0.1"), trade("Trend Following", "High", "0.2"),
    trade("Trend Following", "Low", "-1"), trade("Ranging", "High", "2"),
    trade("Ranging", "High", "8", "open"), trade("Ranging", "Low", "9", "draft"),
  ];
  const before = structuredClone(rows);
  const result = regimeVolatilityAnalytics(rows);
  assert.equal(result.length, 3);
  const high = result.find(g => g.name === "Trend Following · High")!;
  assert.equal(high.totalTrades, 2);
  assert.equal(high.totalR, 0.3);
  assert.equal(high.averageR, 0.15);
  assert.equal(result.reduce((sum, g) => sum + g.totalTrades, 0), 4);
  assert.deepEqual(rows, before);
  assert.deepEqual(GetAnalyticsResponse.shape.byRegimeVolatility.parse(result), result);
});

test("missing conditions and missing R remain visible without inventing results", () => {
  const result = regimeVolatilityAnalytics([
    trade(" ", null, null), trade("Ranging", " Low ", "0"),
    trade("a · b", "c", "1"), trade("a", "b · c", "-1"),
  ]);
  assert.equal(new Set(result.map(g => g.id)).size, 4);
  const unknown = result.find(g => g.name === "Not recorded · Not recorded")!;
  assert.equal(unknown.totalTrades, 1);
  assert.equal(unknown.rSample, 0);
  assert.equal(unknown.averageR, null);
  assert.equal(unknown.sampleWarning, true);
  assert.equal(result.find(g => g.name === "Ranging · Low")!.averageR, 0);
  assert.deepEqual(regimeVolatilityAnalytics([]), []);
});

test("sample warnings count measured R rather than all trades", () => {
  const rows = Array.from({ length: 20 }, () => trade("Counter Trend", "Medium", null));
  assert.equal(regimeVolatilityAnalytics(rows)[0]!.sampleWarning, true);
  assert.equal(regimeVolatilityAnalytics(rows.map(t => ({ ...t, realizedR: "1" })))[0]!.sampleWarning, false);
});
