import test from "node:test";
import assert from "node:assert/strict";
import { mfeAnalytics, summarizeMfe } from "./mfe";

const row = (mfeR: string | null, realizedR: string | null, status = "closed") => ({
  mfeR, realizedR, status, regime: "Trend Following", volatility: "High",
});

test("MFE averages compare identical pairs and do not fabricate missing values", () => {
  assert.deepEqual(summarizeMfe([row("4", "1"), row("2", "-1"), row(null, "10"), row("7", null), row("100", "2", "open")]), {
    totalTrades: 4, recordedCount: 3, pairedCount: 2, averageMfeR: 3, averageRealizedR: 0, averageWinningR: 1, averageGivebackR: 3,
  });
});
test("MFE explicitly records zero and computes decimal gaps without float accumulation", () => {
  assert.deepEqual(summarizeMfe([row("0", "-1"), row("0.3", "0.1")]), {
    totalTrades: 2, recordedCount: 2, pairedCount: 2, averageMfeR: 0.15, averageRealizedR: -0.45, averageWinningR: 0.1, averageGivebackR: 0.6,
  });
});
test("missing MFE produces null averages rather than zero", () => {
  assert.equal(summarizeMfe([row(null, "2")]).averageMfeR, null);
  assert.equal(summarizeMfe([row("2", null)]).averageRealizedR, null);
  assert.equal(summarizeMfe([]).averageGivebackR, null);
});
test("MFE contexts distinguish regime and volatility together and retain unknown contexts", () => {
  const report = mfeAnalytics([row("4", "1"), { ...row("2", "-1"), volatility: "Low" }, { ...row("0", "0"), regime: "", volatility: null }]);
  assert.equal(report.byRegime.find(g => g.name === "Trend Following")!.averageMfeR, 3);
  assert.equal(report.byVolatility.find(g => g.name === "Low")!.averageMfeR, 2);
  assert.equal(report.byContext.length, 3);
  assert.equal(report.byContext.find(g => g.name === "Not recorded · Not recorded")!.averageMfeR, 0);
  assert.equal(mfeAnalytics([row("2", "1", "draft")]).byContext.length, 0);
});

test("MFE winning average uses paired winners in every container without changing gap calculations", () => {
  const report = mfeAnalytics([
    row("4", "2"), row("5", "4"), row("2", "-1"), row("1", "0"),
    row(null, "99"), row("10", null), row("100", "99", "open"), row("100", "99", "draft"),
  ]);
  for (const metrics of [report.overall, ...report.byRegime, ...report.byVolatility, ...report.byContext]) {
    assert.equal(metrics.averageWinningR, 3);
    assert.equal(metrics.pairedCount, 4);
    assert.equal(metrics.averageMfeR, 3);
    assert.equal(metrics.averageGivebackR, 1.75);
  }
  for (const input of [[], [row("2", "-1"), row("1", "0")], [row(null, "2")]]) {
    assert.equal(summarizeMfe(input).averageWinningR, null);
  }
});
