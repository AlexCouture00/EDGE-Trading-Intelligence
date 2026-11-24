import assert from "node:assert/strict";
import test from "node:test";
import { accountsForRuleFirm, createRuleDraft, ruleInput, validateRuleDraft } from "./rule-draft.ts";

const p = { accounts: [
  { id: "account-a", firmId: "firm-a", name: "Evaluation" },
  { id: "account-b", firmId: "firm-b", name: "Evaluation" },
  { id: "account-a2", firmId: "firm-a", name: "Funded" },
] };
// These pure helpers use only account identity, not financial attributes.
const portfolio = p as Parameters<typeof createRuleDraft>[0];
const day = "2026-11-24";

test("new rule derives its firm from the default account", () => {
  const draft = createRuleDraft(portfolio, day);
  assert.equal(draft.accountId, "account-a");
  assert.equal(draft.firmId, "firm-a");
  assert.equal(draft.effectiveDate, day);
});

test("firm selection only offers matching accounts, including duplicate account names", () => {
  assert.deepEqual(accountsForRuleFirm(portfolio, "firm-a").map(a => a.id), ["account-a", "account-a2"]);
  assert.deepEqual(accountsForRuleFirm(portfolio, "firm-b").map(a => a.id), ["account-b"]);
  assert.deepEqual(accountsForRuleFirm(portfolio, "firm-without-accounts"), []);
});

test("changed or stale firm/account pairs cannot be submitted", () => {
  const draft = { ...createRuleDraft(portfolio, day), name: "Loss limit", value: "5000" };
  assert.equal(validateRuleDraft(portfolio, draft), null);
  assert.equal(validateRuleDraft(portfolio, { ...draft, firmId: "firm-b", accountId: "" }), "Choose an account.");
  assert.equal(validateRuleDraft(portfolio, { ...draft, firmId: "firm-b" }), "Choose an account belonging to the selected prop firm.");
  assert.equal(validateRuleDraft(portfolio, { ...draft, firmId: "" }), "Choose a prop firm.");
  assert.equal(validateRuleDraft(portfolio, { ...draft, accountId: "deleted-account" }), "Choose an account belonging to the selected prop firm.");
});

test("edit derives the saved account's firm and does not add server fields to the payload", () => {
  const saved = { ...ruleInput({ ...createRuleDraft(portfolio, day), accountId: "account-b", firmId: "firm-b" }), id: "rule-b", createdAt: "2026-11-01T00:00:00Z" };
  const draft = createRuleDraft(portfolio, day, saved);
  assert.equal(draft.firmId, "firm-b");
  assert.equal(draft.accountId, "account-b");
  const input = ruleInput(draft);
  assert.equal("firmId" in input, false);
  assert.equal("id" in input, false);
  assert.equal("createdAt" in input, false);
});

test("save keeps the existing API contract and normalizes optional verification", () => {
  const input = ruleInput({ ...createRuleDraft(portfolio, day), name: " Loss limit ", value: " 5000 ", verifiedOn: " " });
  assert.equal(input.name, "Loss limit");
  assert.equal(input.value, "5000");
  assert.equal(input.verifiedOn, null);
  assert.equal(input.accountId, "account-a");
  assert.deepEqual(Object.keys(input).sort(), [
    "accountId", "category", "confirmed", "effectiveDate", "explanation", "method",
    "name", "notes", "sourceUrl", "unit", "value", "verifiedOn",
  ]);
});

test("no accounts cannot accidentally authorize an empty rule selection", () => {
  const draft = createRuleDraft({ accounts: [] }, day);
  assert.equal(draft.firmId, "");
  assert.equal(draft.accountId, "");
  assert.equal(validateRuleDraft({ accounts: [] }, draft), "Choose a prop firm.");
});
