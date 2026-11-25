import test from "node:test";
import assert from "node:assert/strict";
import { temporalAnalytics } from "./temporal-analytics";
import { GetAnalyticsResponse } from "@workspace/api-zod";

const trade = (entryAt: string | null, realizedR: string | null = "1", session = "London", status = "closed") => ({
  entryAt, exitAt: "2026-11-25T19:00:00Z", realizedR, netPnl: null, session, status,
});

test("temporal analytics uses local entry time, not exit time, with Monday-first and all 24 hours", () => {
  const a = temporalAnalytics([trade("2026-11-24T00:30:00Z", "2")], "America/Toronto");
  assert.equal(a.byDayOfWeek.length, 7);
  assert.equal(a.byDayOfWeek[0]!.name, "Monday");
  assert.equal(a.byDayOfWeek[0]!.totalR, 2);
  assert.equal(a.byDayOfWeek[1]!.totalTrades, 0);
  assert.equal(a.byHourOfDay.length, 24);
  assert.equal(a.byHourOfDay[19]!.totalR, 2);
  assert.equal(a.byDaySession.find(t => t.dayId === "1" && t.session === "London")!.totalR, 2);
});

test("midnight uses hour 00 and weekend entries remain visible", () => {
  const a = temporalAnalytics([trade("2026-11-22T00:00:00Z")], "UTC");
  assert.equal(a.byHourOfDay[0]!.totalTrades, 1);
  assert.equal(a.byDayOfWeek[6]!.totalTrades, 1);
});

test("DST repeated hours combine while spring-forward hours remain empty", () => {
  const fall = temporalAnalytics([trade("2026-11-01T05:30:00Z"), trade("2026-11-01T06:30:00Z")], "America/New_York");
  assert.equal(fall.byHourOfDay[1]!.totalTrades, 2);
  const spring = temporalAnalytics([trade("2026-03-08T06:30:00Z"), trade("2026-03-08T07:30:00Z")], "America/New_York");
  assert.equal(spring.byHourOfDay[1]!.totalTrades, 1);
  assert.equal(spring.byHourOfDay[2]!.totalTrades, 0);
  assert.equal(spring.byHourOfDay[3]!.totalTrades, 1);
});

test("missing dates, R and sessions are not fabricated; open/draft results are excluded", () => {
  const a = temporalAnalytics([
    trade(null), trade("invalid"), trade("2026-11-23T09:00:00Z", null, " "),
    trade("2026-11-23T09:00:00Z", "50", "London", "open"),
    trade("2026-11-23T09:00:00Z", "50", "London", "draft"),
  ], "UTC");
  assert.equal(a.excludedMissingEntry, 2);
  assert.equal(a.byDayOfWeek[0]!.totalTrades, 1);
  assert.equal(a.byDayOfWeek[0]!.rSample, 0);
  assert.equal(a.byDayOfWeek[0]!.averageR, null);
  assert.ok(a.byDaySession.some(t => t.session === "Not recorded" && t.totalTrades === 1));
  assert.equal(a.byDaySession.reduce((n, g) => n + g.totalTrades, 0), 1);
});

test("R aggregates match across cohorts, preserving decimals and breakeven outcomes", () => {
  const a = temporalAnalytics([
    trade("2026-11-23T09:00:00Z", "0.1"),
    trade("2026-11-23T09:30:00Z", "0.2"),
    trade("2026-11-24T13:00:00Z", "-1", "New York"),
    trade("2026-11-24T13:00:00Z", "0", "New York"),
  ], "UTC");
  assert.equal(a.byDayOfWeek[0]!.totalR, 0.3);
  assert.equal(a.byHourOfDay[9]!.averageR, 0.15);
  assert.equal(a.byDaySession.find(g => g.dayId === "2" && g.session === "New York")!.breakeven, 1);
  assert.equal(a.byDayOfWeek.reduce((n, g) => n + g.totalTrades, 0), 4);
  assert.ok(a.byDayOfWeek.every(g => g.sampleWarning));
});

test("empty cohorts stay empty and invalid timezones fail explicitly", () => {
  const a = temporalAnalytics([], "UTC");
  assert.equal(a.byDaySession.length, 0);
  assert.equal(a.byDayOfWeek[0]!.averageR, null);
  assert.equal(a.byHourOfDay[0]!.winRate, null);
  assert.throws(() => temporalAnalytics([], "Invalid/Timezone"), RangeError);
});

test("generated response contract preserves temporal fields and requires cell dimensions", () => {
  const report = temporalAnalytics([trade("2026-11-23T09:00:00Z")], "UTC");
  assert.deepEqual(GetAnalyticsResponse.shape.temporal.parse(report), report);
  const malformed = structuredClone(report);
  delete (malformed.byDaySession[0] as Partial<(typeof malformed.byDaySession)[number]>).dayId;
  assert.equal(GetAnalyticsResponse.shape.temporal.safeParse(malformed).success, false);
});

test("fractional timezones, historical sessions and measured sample warnings are preserved", () => {
  const rows = Array.from({ length: 20 }, () => trade("2026-11-22T18:45:00Z", "1", "Sydney"));
  const before = structuredClone(rows);
  const report = temporalAnalytics(rows, "Asia/Kolkata");
  assert.equal(report.byDayOfWeek[0]!.totalTrades, 20);
  assert.equal(report.byHourOfDay[0]!.rSample, 20);
  assert.equal(report.byHourOfDay[0]!.sampleWarning, false);
  assert.ok(report.byDaySession.some(g => g.session === "Sydney" && g.dayId === "1" && g.totalTrades === 20));
  assert.deepEqual(rows, before);
  const unknown = temporalAnalytics(rows.map(r => ({ ...r, realizedR: null })), "Asia/Kolkata");
  assert.equal(unknown.byDayOfWeek[0]!.sampleWarning, true);
});
