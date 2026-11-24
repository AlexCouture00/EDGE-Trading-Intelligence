import assert from "node:assert/strict";
import test from "node:test";
import type { PropChallengeInput } from "@workspace/api-client-react";
import { challengeAmount, challengePercentage } from "@workspace/prop-math";
import { challengeInput, toChallengeDraft, validateChallengeDraft } from "./challenge-draft.ts";

const original: PropChallengeInput = {
  accountId: "account-a", name: "Evaluation", structure: "two_step", phase: "Phase 1",
  startingBalance: "100000", profitTarget: "8000", maximumLoss: "10000", dailyLoss: "5000",
  minimumDays: 5, completedDays: 2, startDate: "2026-11-24", expiresOn: null, status: "active", notes: "",
};

test("challenge edit shows target, maximum loss and daily loss as percentages", () => {
  const draft = toChallengeDraft(original);
  assert.equal(draft.profitTarget, "8");
  assert.equal(draft.maximumLoss, "10");
  assert.equal(draft.dailyLoss, "5");
  assert.equal(validateChallengeDraft(draft, original), null);
  assert.deepEqual(challengeInput(draft, original), original);
});

test("changed percentages are saved as exact monetary equivalents", () => {
  const draft = { ...toChallengeDraft(original), profitTarget: "10", maximumLoss: "7.5", dailyLoss: "3" };
  const saved = challengeInput(draft, original);
  assert.equal(validateChallengeDraft(draft, original), null);
  assert.equal(saved.profitTarget, "10000");
  assert.equal(saved.maximumLoss, "7500");
  assert.equal(saved.dailyLoss, "3000");
  assert.equal(saved.startingBalance, original.startingBalance);
});

test("repeating percentages never rewrite unchanged or completed-phase target amounts", () => {
  const phase = { ...original, startingBalance: "33333.33333333", profitTarget: "1234.56789012", maximumLoss: "2222.22222222", dailyLoss: "0.00000001", status: "passed" as const };
  const draft = toChallengeDraft(phase);
  const updated = challengeInput({ ...draft, notes: "Unrelated edit" }, phase);
  assert.equal(updated.profitTarget, phase.profitTarget);
  assert.equal(updated.maximumLoss, phase.maximumLoss);
  assert.equal(updated.dailyLoss, phase.dailyLoss);
  assert.equal(updated.status, "passed");
});

test("equivalent base formatting preserves monetary strings and precision", () => {
  const phase = { ...original, startingBalance: "100000.00", profitTarget: "8000.00000000" };
  const draft = { ...toChallengeDraft(phase), startingBalance: "100000" };
  assert.equal(challengeInput(draft, phase).profitTarget, "8000.00000000");
});

test("a changed starting balance recalculates unchanged percentage thresholds", () => {
  const draft = { ...toChallengeDraft(original), startingBalance: "200000" };
  const saved = challengeInput(draft, original);
  assert.equal(saved.profitTarget, "16000");
  assert.equal(saved.maximumLoss, "20000");
  assert.equal(saved.dailyLoss, "10000");
});

test("optional daily loss supports clearing, null and explicit zero", () => {
  assert.equal(challengeInput({ ...toChallengeDraft(original), dailyLoss: "" }, original).dailyLoss, null);
  const noDaily = { ...original, dailyLoss: null };
  assert.equal(toChallengeDraft(noDaily).dailyLoss, "");
  assert.equal(challengeInput(toChallengeDraft(noDaily), noDaily).dailyLoss, null);
  assert.equal(challengeInput({ ...toChallengeDraft(noDaily), dailyLoss: "0" }, noDaily).dailyLoss, "0");
});

test("invalid percentages, empty required limits and amount overflow cannot be saved", () => {
  const draft = toChallengeDraft(original);
  for (const value of ["-5", "NaN", "5e2", "8%", "5,5", ""]) {
    assert.notEqual(validateChallengeDraft({ ...draft, profitTarget: value }, original), null, value);
  }
  assert.notEqual(validateChallengeDraft({ ...draft, maximumLoss: "" }, original), null);
  assert.notEqual(validateChallengeDraft({ ...draft, profitTarget: "1000000000000000" }, original), null);
  assert.notEqual(validateChallengeDraft({ ...draft, startingBalance: "0", maximumLoss: "5" }, original), null);
});

test("legacy non-positive bases remain unchanged for unrelated edits without division by zero", () => {
  for (const startingBalance of ["0", "-100"]) {
    const phase = { ...original, startingBalance };
    const draft = toChallengeDraft(phase);
    assert.equal(draft.profitTarget, "");
    assert.equal(challengePercentage(phase.profitTarget, startingBalance), null);
    assert.equal(validateChallengeDraft(draft, phase), null);
    assert.deepEqual(challengeInput(draft, phase), phase);
    assert.notEqual(validateChallengeDraft({ ...draft, maximumLoss: "5" }, phase), null);
  }
});

test("percentage conversion uses decimal arithmetic and explicit eight-place rounding", () => {
  assert.equal(challengeAmount("8.25", "123456.78"), "10185.18435");
  assert.equal(challengeAmount("0.00005", "0.01"), "0.00000001");
  assert.throws(() => challengeAmount("8", "0"), /positive starting balance/);
});

test("tiny positive limits on large balances never display as zero percent", () => {
  const percent = challengePercentage("0.00000001", "1000000000000000")!;
  assert.notEqual(percent, "0");
  assert.equal(challengeAmount(percent, "1000000000000000"), "0.00000001");
});
