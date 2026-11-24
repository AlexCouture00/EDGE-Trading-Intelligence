import Decimal from "decimal.js";
import type { z } from "zod";
import type { GetPropManagerResponse } from "@workspace/api-zod";

export type Portfolio = z.infer<typeof GetPropManagerResponse>;
export type PortfolioFilters = { currency: string; firmId?: string; marketType?: string; status?: string; from?: string; to?: string };
const D = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export const sumMoney = (values: (string | number)[]) => values.reduce<Decimal>((sum, v) => sum.plus(v), new D(0)).toFixed();
export const subtractMoney = (a: string, b: string) => new D(a).minus(b).toFixed();
const activeStatuses = new Set(["not_started", "evaluation", "funded", "passed"]);

export function accountSnapshot(p: Portfolio, accountId: string) {
  const account = p.accounts.find(a => a.id === accountId);
  if (!account) throw new Error("Unknown prop account");
  const balances = p.balances.filter(b => b.accountId === accountId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const latest = balances.at(-1);
  const balance = latest?.balance ?? account.startingBalance;
  const highest = Decimal.max(account.startingBalance, ...balances.map(b => b.balance)).toFixed();
  return {
    account, balances, balance, highest, equity: latest?.equity ?? null,
    updatedAt: latest?.createdAt ?? null,
    onAccountProfit: subtractMoney(balance, account.startingBalance),
  };
}

export function evaluateRule(p: Portfolio, rule: Portfolio["rules"][number], today = new Date().toISOString().slice(0, 10)) {
  if (!rule.confirmed || rule.effectiveDate > today) return { status: "not_confirmed" as const, remaining: null, explanation: "Not active: confirm this rule and its effective date first." };
  // Manual snapshots do not establish intraday peaks, daily resets, equity lows,
  // permitted instruments/hours or payout eligibility. Never invent compliance.
  if (rule.method !== "static_balance_loss" || !["amount", "%"].includes(rule.unit)) {
    return { status: "not_enough_data" as const, remaining: null, explanation: "Not enough data. Manual balance snapshots cannot establish continuous compliance with this rule." };
  }
  if (!/^\d{1,16}(\.\d{1,8})?$/.test(rule.value) || new D(rule.value).lte(0) || (rule.unit === "%" && new D(rule.value).gt(100))) {
    return { status: "not_enough_data" as const, remaining: null, explanation: "Enter a positive loss allowance in amount or %; percentages cannot exceed 100." };
  }
  const s = accountSnapshot(p, rule.accountId);
  const allowance = rule.unit === "%" ? new D(s.account.startingBalance).times(rule.value).div(100) : new D(rule.value);
  const floor = new D(s.account.startingBalance).minus(allowance);
  return {
    status: "snapshot_only" as const, remaining: new D(s.balance).minus(floor).toFixed(),
    explanation: `Latest recorded balance only; static floor ${floor.toFixed()} ${s.account.currency}. This does not prove historical or live compliance.`,
  };
}

export function challengeProgress(p: Portfolio, c: Portfolio["challenges"][number]) {
  const s = accountSnapshot(p, c.accountId);
  const balance = c.closingBalance ?? s.balance;
  const profit = new D(balance).minus(c.startingBalance);
  const required = Decimal.max(0, new D(c.profitTarget).minus(profit));
  return {
    balance, profit: profit.toFixed(), requiredProfit: required.toFixed(),
    progress: new D(c.profitTarget).gt(0) ? Decimal.max(0, Decimal.min(100, profit.div(c.profitTarget).times(100))).toNumber() : null,
    daysRemaining: Math.max(0, c.minimumDays - c.completedDays),
    // Pass/fail remains the explicitly recorded result, never an inference
    // from one observed balance or reaching a single profit target.
    status: c.status,
  };
}

export function portfolioReport(p: Portfolio, f: PortfolioFilters) {
  const inDate = (date: string) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
  const firms = p.firms.filter(x => !f.firmId || x.id === f.firmId);
  const firmIds = new Set(firms.map(x => x.id));
  const selected = p.accounts.filter(a => firmIds.has(a.firmId) && a.currency === f.currency
    && (!f.marketType || a.marketType === f.marketType) && (!f.status || a.status === f.status));
  const ids = new Set(selected.map(a => a.id));
  const activeFirmIds = new Set(firms.filter(x => x.status === "active").map(x => x.id));
  const active = selected.filter(a => activeStatuses.has(a.status) && activeFirmIds.has(a.firmId));
  const funded = active.filter(a => a.status === "funded");
  const evaluations = active.filter(a => a.status === "evaluation");
  // Firm-level expenses remain included unless account-only filters are active.
  const expenses = p.expenses.filter(e => e.currency === f.currency && firmIds.has(e.firmId) && inDate(e.date)
    && (e.accountId ? ids.has(e.accountId) : !f.marketType && !f.status));
  const payouts = p.payouts.filter(x => x.currency === f.currency && ids.has(x.accountId));
  const paid = payouts.filter(x => x.status === "paid" && x.paidOn && inDate(x.paidOn));
  const pending = payouts.filter(x => ["requested", "approved"].includes(x.status) && inDate(x.requestedOn));
  const expensesTotal = sumMoney(expenses.map(e => e.amount));
  const received = sumMoney(paid.map(e => e.netReceived));
  const netProfit = subtractMoney(received, expensesTotal);
  const costs = (categories: string[]) => sumMoney(expenses.filter(e => categories.includes(e.category)).map(e => e.amount));
  const months = new Set([...expenses.map(e => e.date.slice(0, 7)), ...paid.map(x => x.paidOn!.slice(0, 7))]);
  let cumulative = "0";
  const monthly = [...months].sort().map(month => {
    const spent = sumMoney(expenses.filter(x => x.date.startsWith(month)).map(x => x.amount));
    const received = sumMoney(paid.filter(x => x.paidOn!.startsWith(month)).map(x => x.netReceived));
    cumulative = sumMoney([cumulative, subtractMoney(received, spent)]);
    return { month, expenses: spent, payouts: received, net: subtractMoney(received, spent), cumulative };
  });
  const remaining = active.map(a => {
    const valid = p.rules.filter(r => r.accountId === a.id).map(r => evaluateRule(p, r))
      .filter(r => r.status === "snapshot_only" && r.remaining !== null);
    return { accountId: a.id, remaining: valid.length ? Decimal.min(...valid.map(x => x.remaining!)).toFixed() : null };
  });
  return {
    accounts: selected, expenses, payouts: [...paid, ...pending], activeAccounts: active.length,
    activeChallenges: p.challenges.filter(c => ids.has(c.accountId) && active.some(a => a.id === c.accountId) && c.status === "active").length,
    fundedAccounts: funded.length,
    nominalAllocatedCapital: sumMoney(active.map(a => a.nominalSize)),
    fundedCapital: sumMoney(funded.map(a => a.nominalSize)),
    challengeCapital: sumMoney(evaluations.map(a => a.nominalSize)),
    challengeFees: costs(["challenge_purchase"]),
    otherSetupCosts: costs(["challenge_reset", "activation", "subscription"]),
    expensesTotal, received, pending: sumMoney(pending.map(x => x.requestedAmount)), netProfit,
    roi: new D(expensesTotal).gt(0) ? new D(netProfit).div(expensesTotal).times(100).toFixed() : null,
    onAccountProfit: sumMoney(active.map(a => accountSnapshot(p, a.id).onAccountProfit)),
    remainingDrawdown: remaining.length && remaining.every(x => x.remaining !== null) ? sumMoney(remaining.map(x => x.remaining!)) : null,
    drawdownCoveredAccounts: remaining.filter(x => x.remaining !== null).length,
    monthly,
    allocationByFirm: firms.map(firm => ({ name: firm.name, value: sumMoney(active.filter(a => a.firmId === firm.id).map(a => a.nominalSize)) })),
    statusDistribution: [...new Set(selected.map(a => a.status))].map(status => ({ name: status, value: selected.filter(a => a.status === status).length })),
    expensesByFirm: firms.map(firm => ({ id: firm.id, name: firm.name, value: sumMoney(expenses.filter(e => e.firmId === firm.id).map(e => e.amount)) })),
    expensesByAccount: selected.map(a => ({ id: a.id, name: a.name, value: sumMoney(expenses.filter(e => e.accountId === a.id).map(e => e.amount)) })),
  };
}
