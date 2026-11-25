import { Router, type IRouter } from "express";
import { db, accounts, confluences, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetAnalyticsQueryParams, GetAnalyticsResponse } from "@workspace/api-zod";
import { matchesConfluences } from "../lib/calculations";
import { summarizeJournal as summarize, journalEquity } from "../lib/journal-r";
import { mfeAnalytics } from "../lib/mfe";
import { temporalAnalytics } from "../lib/temporal-analytics";
import { regimeVolatilityAnalytics } from "../lib/regime-volatility";
import { loadTrades, filterTrades, parseId, HttpError, type LoadedTrade } from "../lib/edge-data";

const router: IRouter = Router();
router.get("/analytics", async (req, res): Promise<void> => {
  const query = GetAnalyticsQueryParams.parse(req.query);
  const owner = res.locals.ownerId as string;
  const [allTrades, allAccounts, allConfluences, pref] = await Promise.all([
    loadTrades(owner),
    db.select().from(accounts).where(eq(accounts.ownerId, owner)),
    db.select().from(confluences).where(eq(confluences.ownerId, owner)),
    db.select().from(settings).where(eq(settings.ownerId, owner)),
  ]);
  if (query.accountId && !allAccounts.some(a => a.id === query.accountId)) throw new HttpError(404, "Account not found.");
  const selectedAccounts = allAccounts.filter(a => (!query.accountId || a.id === query.accountId)
    && (!query.currency || a.currency === query.currency));
  const currencies = new Set(selectedAccounts.map((a) => a.currency));
  if (currencies.size > 1) throw new HttpError(400, "Select one trade currency; currency conversion is not enabled.");
  const currency = query.currency ?? selectedAccounts[0]?.currency ?? "USD";
  const selectedIds = query.confluenceIds ? query.confluenceIds.split(",").filter(Boolean).map(parseId) : [];
  const rows = filterTrades(allTrades, query).filter((t) => query.confluenceIds === undefined || matchesConfluences(t.confluenceIds, selectedIds, query.matchMode ?? "containsAll"));
  const closed = rows.filter((t) => t.status === "closed");
  // Journal performance is trade-only and starts at zero for the selected scope.
  // Preserve legacy balances/cash flows in storage, but never treat them as trading P&L.
  const metrics = summarize(closed);
  const equity = journalEquity(closed);
  if (closed.length || equity.length) {
    const earliest = equity[0]?.date ?? new Date().toISOString();
    equity.unshift({ date: query.from ? new Date(query.from).toISOString() : new Date(new Date(earliest).getTime() - 1).toISOString(), balance: 0, pnl: 0, cumulativeR: 0, drawdown: 0 });
  }
  const min = query.minSample ?? 5;
  const group = (id: string, name: string, items: LoadedTrade[]) => ({ id, name, ...summarize(items), sampleWarning: items.length < 20 });
  const groups = (key: (t: LoadedTrade) => string, label: (t: LoadedTrade) => string = key) => {
    const sets = new Map<string, LoadedTrade[]>();
    for (const t of closed) { const k = key(t); sets.set(k, [...(sets.get(k) ?? []), t]); }
    return [...sets.entries()].map(([id, list]) => group(id, label(list[0]!), list));
  };
  const timezone = pref[0]?.timezone ?? "UTC";
  const month = (t: LoadedTrade) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(new Date(t.exitAt!));
    return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
  };
  const combinationSets = new Map<string, string[]>();
  for (const t of closed) {
    const ids = [...t.confluenceIds].sort();
    // Exact observed sets and pairs only; bounded to avoid exponential subset exploration.
    if (ids.length) combinationSets.set(ids.join(","), ids);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const pair = [ids[i]!, ids[j]!]; combinationSets.set(pair.join(","), pair);
    }
  }
  const combinations = [...combinationSets.entries()].map(([id, ids]) => ({
    ...group(id, ids.map((c) => allConfluences.find((x) => x.id === c)?.name ?? "Archived confluence").join(" + "), closed.filter((t) => matchesConfluences(t.confluenceIds, ids, query.matchMode ?? "containsAll"))),
    confluenceIds: ids,
  })).filter((g) => g.totalTrades >= min).sort((a, b) => b.totalTrades - a.totalTrades || (b.averageR ?? -Infinity) - (a.averageR ?? -Infinity)).slice(0, 100);
  const warnings = [
    ...(closed.length < 20 ? ["Small sample: fewer than 20 closed trades. Observed associations are not evidence of a repeatable edge."] : []),
    ...(metrics.rSample < closed.length ? [`${closed.length - metrics.rSample} historical closed trades have no recorded R and are excluded from result metrics.`] : []),
    "Win rate excludes breakeven outcomes. Expectancy and profit factor use recorded R, not dollar amounts.",
    "Journal results and drawdown are measured in R. Historical trades without R remain in the journal but do not contribute to the R curve.",
    "Confluence association does not prove causation. Combination rankings prioritize sample size; no statistical superiority is implied.",
  ];
  res.json(GetAnalyticsResponse.parse({
    isDemo: res.locals.isDemo, currency, metrics, equity,
    mfe: mfeAnalytics(closed),
    temporal: temporalAnalytics(closed, timezone),
    byRegimeVolatility: regimeVolatilityAnalytics(closed),
    monthly: groups(month).sort((a, b) => a.id.localeCompare(b.id)),
    byInstrument: groups((t) => t.symbol),
    byStrategy: groups((t) => t.strategyId ?? "Unassigned", (t) => t.strategyName ?? "Unassigned"),
    byDirection: groups((t) => t.direction),
    bySession: groups((t) => t.session.trim() || "Not recorded").sort((a, b) => a.name.localeCompare(b.name)),
    byRegime: groups((t) => t.regime.trim() || "Not recorded").sort((a, b) => a.name.localeCompare(b.name)),
    byVolatility: groups((t) => t.volatility || "Not recorded").sort((a, b) =>
      ["High", "Medium", "Low", "Not recorded"].indexOf(a.name) - ["High", "Medium", "Low", "Not recorded"].indexOf(b.name)),
    byEmotion: groups((t) => t.emotion || "Not recorded"),
    byGrade: groups((t) => t.grade || "Not graded"),
    confluences: allConfluences.filter((c) => !c.archived).map((c) => ({
      ...group(c.id, c.name, closed.filter((t) => t.confluenceIds.includes(c.id))),
      color: c.color,
    })),
    combinations,
    byConfluenceCount: Array.from({ length: 7 }, (_, n) => group(String(n), n === 6 ? "6+" : String(n), closed.filter((t) => n === 6 ? t.confluenceIds.length >= 6 : t.confluenceIds.length === n))),
    recentTrades: [...rows].sort((a, b) => new Date(b.entryAt ?? b.createdAt).getTime() - new Date(a.entryAt ?? a.createdAt).getTime()).slice(0, 6),
    openTrades: rows.filter((t) => t.status === "open").length,
    warnings,
  }));
});
export default router;
