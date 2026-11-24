import { D } from "./calculations";

type MfeTrade = {
  status: string;
  mfeR?: string | null;
  realizedR: string | null;
  regime: string;
  volatility?: string | null;
};

// All compared averages use exactly the same paired trades. Unknown is not zero.
export function summarizeMfe(input: MfeTrade[]) {
  const closed = input.filter(t => t.status === "closed");
  const recorded = closed.filter(t => t.mfeR != null);
  const paired = recorded.filter(t => t.realizedR != null);
  const mean = (pick: (t: MfeTrade) => string) => paired.length
    ? paired.reduce((sum, t) => sum.plus(pick(t)), D()).div(paired.length).toNumber()
    : null;
  return {
    totalTrades: closed.length,
    recordedCount: recorded.length,
    pairedCount: paired.length,
    averageMfeR: mean(t => t.mfeR!),
    averageRealizedR: mean(t => t.realizedR!),
    averageGivebackR: mean(t => D(t.mfeR!).minus(t.realizedR!).toString()),
  };
}

export function mfeAnalytics(input: MfeTrade[]) {
  const closed = input.filter(t => t.status === "closed");
  const regime = (t: MfeTrade) => t.regime.trim() || "Not recorded";
  const volatility = (t: MfeTrade) => t.volatility || "Not recorded";
  const groups = (key: (t: MfeTrade) => string, label = key) => {
    const sets = new Map<string, MfeTrade[]>();
    for (const t of closed) {
      const k = key(t);
      if (!sets.has(k)) sets.set(k, []);
      sets.get(k)!.push(t);
    }
    return [...sets].map(([id, trades]) => ({ id, name: label(trades[0]!), ...summarizeMfe(trades) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };
  return {
    overall: summarizeMfe(closed),
    byRegime: groups(regime),
    byVolatility: groups(volatility),
    byContext: groups(t => JSON.stringify([regime(t), volatility(t)]), t => `${regime(t)} · ${volatility(t)}`),
  };
}
