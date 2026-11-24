import assert from "node:assert/strict";
import test from "node:test";
import { maxRDrawdown, rDrawdown, totalRecordedR } from "./journal-r.ts";

test("R drawdown follows the cumulative R peak and starts at zero", () => {
  const points = [0, -1, 2, 1.5, -1, 3].map(cumulativeR => ({ cumulativeR }));
  assert.deepEqual(rDrawdown(points), [0, 1, 0, 0.5, 3, 0]);
  assert.equal(maxRDrawdown(points), 3);
  assert.equal(maxRDrawdown([]), 0);
});

test("calendar and journal totals distinguish missing R from recorded zero", () => {
  assert.equal(totalRecordedR([{ status: "closed", realizedR: null }]), null);
  assert.equal(totalRecordedR([{ status: "closed", realizedR: "0" }]), 0);
  assert.equal(totalRecordedR([
    { status: "closed", realizedR: "2" }, { status: "closed", realizedR: "-1" },
    { status: "open", realizedR: "99" }, { status: "closed", realizedR: null },
  ]), 1);
});
