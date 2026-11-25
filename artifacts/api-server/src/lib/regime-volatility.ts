import type { Outcome } from "./calculations";
import { summarizeJournal } from "./journal-r";

type ContextTrade = Outcome & { regime?: string | null; volatility?: string | null };

/** Joint cohorts, never sums or averages of the separate marginal breakdowns. */
export function regimeVolatilityAnalytics(rows: ContextTrade[]) {
  const sets = new Map<string, { regime: string; volatility: string; trades: ContextTrade[] }>();
  for (const trade of rows) {
    if (trade.status !== "closed") continue;
    const regime = trade.regime?.trim() || "Not recorded";
    const volatility = trade.volatility?.trim() || "Not recorded";
    const id = JSON.stringify([regime, volatility]);
    const cohort = sets.get(id) ?? { regime, volatility, trades: [] };
    cohort.trades.push(trade);
    sets.set(id, cohort);
  }
  const order = (value: string) => {
    const index = ["High", "Medium", "Low", "Not recorded"].indexOf(value);
    return index < 0 ? 4 : index;
  };
  return [...sets.entries()]
    .sort(([, a], [, b]) => a.regime.localeCompare(b.regime)
      || order(a.volatility) - order(b.volatility) || a.volatility.localeCompare(b.volatility))
    .map(([id, cohort]) => {
      const metrics = summarizeJournal(cohort.trades);
      return {
        id, name: `${cohort.regime} · ${cohort.volatility}`,
        ...metrics, sampleWarning: metrics.rSample < 20,
      };
    });
}
