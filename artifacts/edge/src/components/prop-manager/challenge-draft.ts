import type { PropChallengeInput } from "@workspace/api-client-react";
import { challengeAmount, challengePercentage, subtractMoney } from "@workspace/prop-math";

export type ChallengeDraft = Omit<PropChallengeInput, "dailyLoss" | "expiresOn" | "minimumDays" | "completedDays"> & {
  dailyLoss: string; expiresOn: string; minimumDays: string; completedDays: string;
};
type Threshold = "profitTarget" | "maximumLoss" | "dailyLoss";
const moneyPattern = /^-?\d{1,16}(\.\d{1,8})?$/;
const unsignedMoneyPattern = /^\d{1,16}(\.\d{1,8})?$/;

export function toChallengeDraft(c: PropChallengeInput): ChallengeDraft {
  return {
    accountId: c.accountId, name: c.name, structure: c.structure, phase: c.phase,
    startingBalance: c.startingBalance,
    profitTarget: challengePercentage(c.profitTarget, c.startingBalance) ?? "",
    maximumLoss: challengePercentage(c.maximumLoss, c.startingBalance) ?? "",
    dailyLoss: c.dailyLoss === null ? "" : challengePercentage(c.dailyLoss, c.startingBalance) ?? "",
    startDate: c.startDate, status: c.status, notes: c.notes, expiresOn: c.expiresOn ?? "",
    minimumDays: String(c.minimumDays), completedDays: String(c.completedDays),
  };
}

export function thresholdAmount(d: ChallengeDraft, original: PropChallengeInput, key: Threshold): string | null {
  const previous = original[key];
  const sameBase = moneyPattern.test(d.startingBalance) && moneyPattern.test(original.startingBalance)
    && subtractMoney(d.startingBalance, original.startingBalance) === "0";
  const previousPercentage = previous === null ? "" : challengePercentage(previous, original.startingBalance) ?? "";
  // Never round-trip historical money through a rounded/repeating percentage.
  // This also preserves legacy zero/negative-base records during unrelated edits.
  if (sameBase && d[key] === previousPercentage) return previous;
  if (key === "dailyLoss" && d[key].trim() === "") return null;
  return challengeAmount(d[key], d.startingBalance);
}

export function challengeInput(d: ChallengeDraft, original: PropChallengeInput): PropChallengeInput {
  return {
    ...d, name: d.name.trim(), phase: d.phase.trim(),
    profitTarget: thresholdAmount(d, original, "profitTarget")!,
    maximumLoss: thresholdAmount(d, original, "maximumLoss")!,
    dailyLoss: thresholdAmount(d, original, "dailyLoss"),
    expiresOn: d.expiresOn.trim() || null,
    minimumDays: Number(d.minimumDays), completedDays: Number(d.completedDays),
  };
}

export function validateChallengeDraft(d: ChallengeDraft, original: PropChallengeInput): string | null {
  if (!d.accountId) return "Choose an account.";
  if (!d.name.trim() || !d.phase.trim()) return "Name and phase are required.";
  if (!moneyPattern.test(d.startingBalance)) return "Starting balance must be a plain decimal.";
  if (!/^\d+$/.test(d.minimumDays) || !/^\d+$/.test(d.completedDays)) return "Days must be whole numbers.";
  try {
    const input = challengeInput(d, original);
    if (!unsignedMoneyPattern.test(input.profitTarget) || !unsignedMoneyPattern.test(input.maximumLoss)
      || (input.dailyLoss !== null && !unsignedMoneyPattern.test(input.dailyLoss))) {
      return "Enter valid percentages; calculated amounts must fit 16 whole digits and 8 decimal places.";
    }
    if (Number(input.profitTarget) <= 0 && input.structure !== "instant_funded") return "Profit target must produce a positive amount.";
    return null;
  } catch (e) { return e instanceof Error ? e.message : "Enter valid percentages and a positive starting balance."; }
}
