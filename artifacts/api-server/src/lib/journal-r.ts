import { D, summarize, type Outcome } from "./calculations";

// R is dimensionless. Never write normalized results into monetary columns.
export function summarizeJournal(rows: Outcome[]) {
  const closed = rows.filter(t => t.status === "closed");
  const financial = summarize(rows);
  const measured = closed.filter(t => t.realizedR !== null);
  const winners = measured.filter(t => D(t.realizedR!).gt(0));
  const normalized = summarize(measured.map(t => ({ ...t, netPnl: t.realizedR })));
  const process = summarize(closed.map(t => ({ ...t, netPnl: "0" })));
  let streak = 0;
  for (const trade of [...closed].sort((a, b) => new Date(a.exitAt!).getTime() - new Date(b.exitAt!).getTime())) {
    const sign = trade.realizedR === null ? 0 : D(trade.realizedR).cmp(0);
    streak = sign === 0 ? 0 : Math.sign(streak) === sign ? streak + sign : sign;
  }
  return {
    ...financial,
    ...normalized,
    averageWinningR: winners.length ? winners.reduce((sum, t) => sum.plus(t.realizedR!), D()).div(winners.length).toNumber() : null,
    totalTrades: closed.length,
    netPnl: financial.netPnl,
    maxDrawdown: financial.maxDrawdown,
    maxDrawdownPercent: financial.maxDrawdownPercent,
    averageHoldHours: process.averageHoldHours,
    ruleAdherence: process.ruleAdherence,
    streak,
  };
}

export function journalEquity(rows: Outcome[]) {
  let cumulativeR = D(), pnl = D(), peakPnl = D();
  return rows.filter(t => t.status === "closed").sort((a, b) =>
    new Date(a.exitAt!).getTime() - new Date(b.exitAt!).getTime()
  ).map(t => {
    cumulativeR = cumulativeR.plus(t.realizedR ?? "0");
    pnl = pnl.plus(t.netPnl ?? "0");
    if (pnl.gt(peakPnl)) peakPnl = pnl;
    return { date: new Date(t.exitAt!).toISOString(), balance: pnl.toNumber(), pnl: pnl.toNumber(),
      cumulativeR: cumulativeR.toNumber(), drawdown: peakPnl.minus(pnl).toNumber() };
  });
}
