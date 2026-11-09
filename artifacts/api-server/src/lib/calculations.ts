import Decimal from "decimal.js";

Decimal.set({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export const D = (n: Decimal.Value = 0) => new Decimal(n);
export const money = (n: Decimal.Value) => D(n).toFixed(8);
export type Outcome = {
  netPnl: string | null;
  realizedR: string | null;
  status: string;
  entryAt?: string | Date | null;
  exitAt?: string | Date | null;
  followedPlan?: boolean | null;
};

export function netResult(gross: string, commission = "0", funding = "0", slippage = "0") {
  return money(D(gross).minus(commission).minus(funding).minus(slippage));
}

export function realizedR(net: string, initialRisk?: string | null) {
  return initialRisk != null && D(initialRisk).gt(0) ? money(D(net).div(initialRisk)) : null;
}

export function linearPnl(entry: string, exit: string, quantity: string, multiplier: string, direction: string) {
  return money(D(exit).minus(entry).mul(quantity).mul(multiplier).mul(direction === "short" ? -1 : 1));
}

export function matchesConfluences(actual: string[], selected: string[], mode: string) {
  const a = new Set(actual), s = new Set(selected);
  return [...s].every((id) => a.has(id)) && (mode !== "exact" || a.size === s.size);
}

export function summarize(input: Outcome[], startingBalance: string = "0") {
  const rows = input.filter((t) => t.status === "closed" && t.netPnl !== null)
    .sort((a, b) => new Date(a.exitAt ?? 0).getTime() - new Date(b.exitAt ?? 0).getTime());
  const wins = rows.filter((t) => D(t.netPnl!).gt(0));
  const losses = rows.filter((t) => D(t.netPnl!).lt(0));
  const breakeven = rows.length - wins.length - losses.length;
  const sum = (r: Outcome[]) => r.reduce((s, t) => s.plus(t.netPnl!), D());
  const positive = sum(wins), negative = sum(losses).abs();
  const rs = rows.flatMap((t) => t.realizedR !== null ? [D(t.realizedR)] : []).sort((a, b) => a.cmp(b));
  const totalR = rs.reduce((s, r) => s.plus(r), D());
  const median = rs.length ? rs.length % 2 ? rs[Math.floor(rs.length / 2)]! : rs[rs.length / 2 - 1]!.plus(rs[rs.length / 2]!).div(2) : null;
  let balance = D(startingBalance), peak = balance, maxDD = D(), maxPercent = D(), streak = 0;
  for (const t of rows) {
    balance = balance.plus(t.netPnl!);
    peak = Decimal.max(peak, balance);
    const dd = peak.minus(balance);
    maxDD = Decimal.max(maxDD, dd);
    if (peak.gt(0)) maxPercent = Decimal.max(maxPercent, dd.div(peak).mul(100));
    const sign = D(t.netPnl!).cmp(0);
    streak = sign === 0 ? 0 : Math.sign(streak) === sign ? streak + sign : sign;
  }
  const graded = rows.filter((t) => t.followedPlan != null);
  const holds = rows.filter((t) => t.entryAt && t.exitAt).map((t) => (new Date(t.exitAt!).getTime() - new Date(t.entryAt!).getTime()) / 3600000);
  return {
    totalTrades: rows.length, wins: wins.length, losses: losses.length, breakeven,
    winRate: wins.length + losses.length ? D(wins.length).div(wins.length + losses.length).mul(100).toNumber() : null,
    netPnl: money(sum(rows)), averageR: rs.length ? totalR.div(rs.length).toNumber() : null,
    medianR: median?.toNumber() ?? null, totalR: totalR.toNumber(), rSample: rs.length,
    profitFactor: negative.gt(0) ? positive.div(negative).toNumber() : null,
    profitFactorInfinite: negative.eq(0) && positive.gt(0),
    maxDrawdown: money(maxDD), maxDrawdownPercent: D(startingBalance).gt(0) ? maxPercent.toNumber() : null,
    ruleAdherence: graded.length ? graded.filter((t) => t.followedPlan).length / graded.length * 100 : null,
    averageHoldHours: holds.length ? holds.reduce((s, h) => s + h, 0) / holds.length : null,
    streak,
  };
}

export type CashEvent = { date: Date | string; amount: string; type: string };
export function equitySeries(rows: Outcome[], startingBalance: string, flows: CashEvent[], from?: Date, to?: Date) {
  // External flows change balance but are removed from the high-water drawdown calculation.
  const events = [
    ...rows.filter((t) => t.status === "closed" && t.netPnl !== null).map((t) => ({
      date: new Date(t.exitAt!), pnl: t.netPnl!, r: t.realizedR, cash: false,
    })),
    ...flows.map((f) => ({ date: new Date(f.date), pnl: D(f.amount).mul(f.type === "withdrawal" ? -1 : 1).toString(), r: null, cash: true })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = D(startingBalance), tradingBalance = balance, peak = balance, pnl = D(), r = D();
  const points: { date: string; balance: number; pnl: number; cumulativeR: number; drawdown: number }[] = [];
  for (const e of events) {
    if (to && e.date > to) continue;
    if (from && e.date < from) {
      balance = balance.plus(e.pnl);
      // Bring prior performance into the opening balance, but reset selected-period P&L/R.
      tradingBalance = balance;
      peak = balance;
      continue;
    }
    balance = balance.plus(e.pnl);
    if (!e.cash) {
      tradingBalance = tradingBalance.plus(e.pnl);
      pnl = pnl.plus(e.pnl);
      r = r.plus(e.r ?? "0");
    }
    peak = Decimal.max(peak, tradingBalance);
    points.push({ date: e.date.toISOString(), balance: balance.toNumber(), pnl: pnl.toNumber(), cumulativeR: r.toNumber(), drawdown: peak.minus(tradingBalance).toNumber() });
  }
  return points;
}
