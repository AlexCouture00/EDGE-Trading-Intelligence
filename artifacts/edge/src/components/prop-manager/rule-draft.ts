import type { PropRule, PropRuleInput } from "@workspace/api-client-react";
import type { Portfolio } from "@workspace/prop-math";

export type RuleDraft = Omit<PropRuleInput, "verifiedOn"> & { firmId: string; verifiedOn: string };
type Accounts = Pick<Portfolio, "accounts">;

export function accountsForRuleFirm(p: Accounts, firmId: string) {
  return p.accounts.filter((account) => account.firmId === firmId);
}

export function createRuleDraft(p: Accounts, day: string, rule?: PropRule): RuleDraft {
  const accountId = rule?.accountId ?? p.accounts[0]?.id ?? "";
  return {
    firmId: p.accounts.find((account) => account.id === accountId)?.firmId ?? "",
    accountId, name: rule?.name ?? "", category: rule?.category ?? "risk",
    value: rule?.value ?? "", unit: rule?.unit ?? "amount", method: rule?.method ?? "static_balance_loss",
    explanation: rule?.explanation ?? "", effectiveDate: rule?.effectiveDate ?? day,
    sourceUrl: rule?.sourceUrl ?? "", notes: rule?.notes ?? "",
    confirmed: rule?.confirmed ?? false, verifiedOn: rule?.verifiedOn ?? "",
  };
}

export function validateRuleDraft(p: Accounts, draft: RuleDraft): string | null {
  if (!draft.firmId) return "Choose a prop firm.";
  if (!draft.accountId) return "Choose an account.";
  if (!accountsForRuleFirm(p, draft.firmId).some((account) => account.id === draft.accountId)) {
    return "Choose an account belonging to the selected prop firm.";
  }
  if (!draft.name.trim() || !draft.value.trim()) return "Name and value are required.";
  return null;
}

export function ruleInput(draft: RuleDraft): PropRuleInput {
  // Firm selection is a form filter. The persisted account determines the firm.
  const { firmId: _firmId, ...input } = draft;
  return {
    ...input, name: input.name.trim(), value: input.value.trim(),
    verifiedOn: input.verifiedOn.trim() || null,
  };
}
