import assert from "node:assert/strict";
import test from "node:test";
import { monthLabel } from "./month-label.ts";

test("monthly labels show month names and preserve years across December and January", () => {
  assert.equal(monthLabel("2026-10"), "October 2026");
  assert.equal(monthLabel("2026-12"), "December 2026");
  assert.equal(monthLabel("2027-01"), "January 2027");
});

test("invalid or already formatted month labels remain unchanged", () => {
  for (const value of ["", "2026-00", "2026-13", "2026-1", "October 2026"]) {
    assert.equal(monthLabel(value), value);
  }
});
