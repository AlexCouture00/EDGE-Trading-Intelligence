import assert from "node:assert/strict";
import test from "node:test";
import { journalEquity, summarizeJournal } from "./journal-r";
import type { Outcome } from "./calculations";

const row = (r: string | null, net: string | null = null, day = 1): Outcome => ({
  status: "closed", realizedR: r, netPnl: net,
  entryAt: `2026-01-${String(day).padStart(2, "0")}T09:00:00Z`,
  exitAt: `2026-01-${String(day).padStart(2, "0")}T10:00:00Z`,
});

test("R-only outcomes count wins, losses and breakevens without dollar results", () => {
  const report = summarizeJournal([row("2"), row("-1", null, 2), row("0", null, 3)]);
  assert.equal(report.totalTrades, 3);
  assert.equal(report.totalR, 1);
  assert.equal(report.rSample, 3);
  assert.equal(report.wins, 1);
  assert.equal(report.losses, 1);
  assert.equal(report.breakeven, 1);
  assert.equal(report.profitFactor, 2);
  assert.equal(report.netPnl, "0.00000000");
  assert.equal(report.averageHoldHours, 1);
});

test("historical and direct R aggregate without treating missing R as breakeven", () => {
  const input = [row("2", "400"), row("-1", null, 2), row(null, "100", 3)];
  const snapshot = structuredClone(input);
  const report = summarizeJournal(input);
  assert.equal(report.totalTrades, 3);
  assert.equal(report.rSample, 2);
  assert.equal(report.totalR, 1);
  assert.equal(report.profitFactor, 2);
  assert.equal(report.breakeven, 0);
  assert.equal(report.netPnl, "500.00000000");
  assert.equal(report.streak, 0, "an unavailable outcome breaks a consecutive-results streak");
  const points = journalEquity(input);
  assert.deepEqual(points.map(p => p.cumulativeR), [2, 1, 1]);
  assert.deepEqual(points.map(p => p.pnl), [400, 400, 500]);
  assert.deepEqual(input, snapshot);
});

test("R result metrics exclude drafts, open trades and unavailable historical R", () => {
  const report = summarizeJournal([row(null, "100"), { ...row("99"), status: "open" }]);
  assert.equal(report.totalTrades, 1);
  assert.equal(report.totalR, 0);
  assert.equal(report.rSample, 0);
  assert.equal(report.winRate, null);
  assert.equal(report.averageR, null);
});
