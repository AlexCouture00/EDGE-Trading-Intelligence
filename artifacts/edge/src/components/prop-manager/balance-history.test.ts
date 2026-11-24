import assert from "node:assert/strict";
import test from "node:test";
import type { PropBalance } from "@workspace/api-client-react";
import { accountSnapshot, balanceDate, balanceHistory, sumMoney, type Portfolio } from "@workspace/prop-math";
import { balanceChartPoints, balanceDateLabel, validateBalanceDate } from "./balance-history.ts";

const account = {
  id: "account-a", firmId: "firm-a", name: "Evaluation", reference: "", marketType: "CFD" as const,
  platform: "", currency: "USD", nominalSize: "100000", startingBalance: "100000",
  purchasedOn: "2026-11-01", status: "evaluation" as const, phase: "Phase 1", journalAccountId: null, notes: "",
};
const point = (id: string, recordedOn: string | undefined, balance: string, createdAt: string): PropBalance => ({
  id, accountId: account.id, recordedOn, balance, equity: null, note: "",
  previousBalance: "0", difference: "0", createdAt,
});
const entries = [
  point("latest", "2026-11-05", "103000", "2026-11-05T18:00:00.000Z"),
  point("middle", "2026-11-03", "102000", "2026-11-03T18:00:00.000Z"),
  point("backdated", "2026-11-02", "101000", "2026-11-24T18:00:00.000Z"),
];
const portfolio = (balances: PropBalance[]): Portfolio => ({
  firms: [], accounts: [account], balances, challenges: [], rules: [], expenses: [], payouts: [],
});

test("backdated entries use balance dates, not insertion order, for current balance and equity", () => {
  const s = accountSnapshot(portfolio(entries), account.id);
  assert.deepEqual(s.balances.map(b => b.id), ["backdated", "middle", "latest"]);
  assert.equal(s.balance, "103000");
  assert.equal(s.balanceDate, "2026-11-05");
  assert.equal(s.highest, "103000");
  assert.equal(s.onAccountProfit, "3000");
});

test("chronological differences are recomputed without mutating stored snapshots or timestamps", () => {
  const original = structuredClone(entries);
  const history = balanceHistory(account.startingBalance, entries);
  assert.deepEqual(history.map(b => b.previousBalance), ["100000", "101000", "102000"]);
  assert.deepEqual(history.map(b => b.difference), ["1000", "1000", "1000"]);
  assert.equal(sumMoney(history.map(b => b.difference)), "3000");
  assert.deepEqual(entries, original);
  assert.equal(history[0].createdAt, "2026-11-24T18:00:00.000Z");
});

test("legacy snapshots keep the UTC insertion day when no balance date exists", () => {
  const legacy = point("legacy", undefined, "100100", "2026-11-03T00:30:00.000Z");
  assert.equal(balanceDate(legacy), "2026-11-03");
  assert.equal(balanceHistory(account.startingBalance, [legacy])[0].recordedOn, "2026-11-03");
  assert.equal(legacy.recordedOn, undefined);
});

test("same-day corrections retain all history but the latest inserted observation wins", () => {
  const first = point("a", "2026-11-03", "101000", "2026-11-03T18:00:00.000Z");
  const correction = point("b", "2026-11-03", "101500", "2026-11-24T18:00:00.000Z");
  const s = accountSnapshot(portfolio([correction, first]), account.id);
  assert.equal(s.balances.length, 2);
  assert.equal(s.balance, "101500");
  assert.deepEqual(balanceChartPoints(account, s.balances).map(p => p.v), [100000, 101500]);
});

test("chart points preserve real date spacing and chronological values", () => {
  const points = balanceChartPoints(account, entries);
  assert.deepEqual(points.map(p => p.v), [100000, 101000, 102000, 103000]);
  assert.equal(points[3].t - points[2].t, 2 * 86_400_000);
  assert.equal(points[1].t, Date.parse("2026-11-02T00:00:00Z"));
});

test("history before purchase date does not acquire a fictitious later starting-balance point", () => {
  const points = balanceChartPoints({ ...account, purchasedOn: "2026-11-04" }, entries);
  assert.deepEqual(points.map(p => p.v), [101000, 102000, 103000]);
});

test("date validation rejects future and impossible days but accepts past leap days", () => {
  for (const day of ["", "2026-02-30", "2026-13-01", "2026-11-25", "0000-01-01", "2026-11-01T12:00:00Z"]) {
    assert.notEqual(validateBalanceDate(day, "2026-11-24"), null, day);
  }
  assert.equal(validateBalanceDate("2024-02-29", "2026-11-24"), null);
  assert.equal(validateBalanceDate("2026-11-24", "2026-11-24"), null);
});

test("calendar date labels never shift when the viewer timezone changes", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["America/Toronto", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      assert.equal(balanceDateLabel("2026-11-03"), "03 Nov 26");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
