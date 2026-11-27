import test from "node:test";
import assert from "node:assert/strict";
import { GetAnalyticsQueryParams, GetAnalyticsResponse } from "@workspace/api-zod";
import { regimeScope } from "./regime-scope";
import { summarizeJournal, journalEquity } from "./journal-r";
import { mfeAnalytics } from "./mfe";
import { temporalAnalytics } from "./temporal-analytics";
import { regimeVolatilityAnalytics } from "./regime-volatility";

const trade = (regime: string, realizedR: string | null, status = "closed") => ({
  regime, realizedR, status, netPnl: null, mfeR: "3", session: "London", volatility: "High",
  entryAt: "2026-11-23T10:00:00Z", exitAt: "2026-11-23T11:00:00Z",
});

test("regime selection applies consistently to metrics, curves, MFE and all breakdowns", () => {
  const input = [
    trade("Trend Following", "2"), trade("Trend Following", "-1"),
    trade("Counter Trend", "5"), trade("Ranging", "9"),
  ];
  const before = structuredClone(input);
  const query = GetAnalyticsQueryParams.parse({ regime: "Trend Following" });
  const { rows, availableRegimes } = regimeScope(input, query.regime);
  assert.deepEqual(availableRegimes, ["Counter Trend", "Ranging", "Trend Following"]);
  assert.equal(summarizeJournal(rows).totalR, 1);
  assert.equal(summarizeJournal(rows).averageR, 0.5);
  assert.equal(summarizeJournal(rows).averageWinningR, 2);
  assert.equal(journalEquity(rows).at(-1)!.cumulativeR, 1);
  assert.equal(mfeAnalytics(rows).overall.averageRealizedR, 0.5);
  assert.equal(temporalAnalytics(rows, "UTC").byDayOfWeek[0]!.totalTrades, 2);
  const temporal = temporalAnalytics(rows, "UTC");
  for (const group of [...temporal.byDayOfWeek, ...temporal.byHourOfDay, ...temporal.byDaySession]) {
    assert.equal(group.averageWinningR, group.totalTrades ? 2 : null);
  }
  assert.equal(regimeVolatilityAnalytics(rows)[0]!.totalR, 1);
  assert.equal(regimeVolatilityAnalytics(rows)[0]!.averageWinningR, 2);
  assert.deepEqual(GetAnalyticsResponse.shape.availableRegimes.parse(availableRegimes), availableRegimes);
  assert.deepEqual(input, before);
});

test("all regimes, empty results, missing labels and legacy labels remain selectable", () => {
  const input = [trade(" ", null), trade("Legacy regime", "0"), trade("Ranging", "2", "open")];
  assert.deepEqual(regimeScope(input).rows, input);
  assert.deepEqual(regimeScope(input, "").rows, input);
  assert.equal(regimeScope(input, "Not recorded").rows.length, 1);
  assert.equal(regimeScope(input, "Legacy regime").rows[0]!.realizedR, "0");
  assert.deepEqual(regimeScope(input, "Counter Trend").rows, []);
  assert.deepEqual(regimeScope(input, "Counter Trend").availableRegimes, ["Legacy regime", "Not recorded"]);
  assert.equal(regimeScope(input, "Ranging").rows[0]!.status, "open");
  assert.deepEqual(regimeScope([], "Ranging"), { rows: [], availableRegimes: [] });
  assert.equal(GetAnalyticsQueryParams.safeParse({ regime: "x".repeat(101) }).success, false);
});
