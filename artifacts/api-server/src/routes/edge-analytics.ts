import { Router, type IRouter } from "express";
import { db, accounts, cashFlows, confluences, settings } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { GetAnalyticsQueryParams, GetAnalyticsResponse } from "@workspace/api-zod";
import { D, money, summarize, equitySeries, matchesConfluences } from "../lib/calculations";
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
  const selectedAccounts = query.accountId ? allAccounts.filter((a) => a.id === query.accountId) : allAccounts;
  if (query.accountId && !selectedAccounts.length) throw new HttpError(404, "Account not found.");
  const currencies = new Set(selectedAccounts.map((a) => a.currency));
  if (currencies.size > 1) throw new HttpError(400, "Accounts have different currencies. Select one account; currency conversion is not enabled.");
  const currency = selectedAccounts[0]?.currency ?? "USD";
  const selectedIds = query.confluenceIds ? query.confluenceIds.split(",").filter(Boolean).map(parseId) : [];
  const rows = filterTrades(allTrades, query).filter((t) => query.confluenceIds === undefined || matchesConfluences(t.confluenceIds, selectedIds, query.matchMode ?? "containsAll"));
  const closed = rows.filter((t) => t.status === "closed");
  const starting = selectedAccounts.reduce((s, a) => s.plus(a.initialBalance), D());
  const selectedAccountIds = selectedAccounts.map((a) => a.id);
  const flows = selectedAccountIds.length ? await db.select().from(cashFlows).where(and(eq(cashFlows.ownerId, owner), inArray(cashFlows.accountId, selectedAccountIds))) : [];
  const priorDate = query.from ? new Date(query.from).getTime() : null;
  const prior = allTrades.filter((t) => selectedAccountIds.includes(t.accountId) && t.status === "closed" && priorDate !== null && new Date(t.exitAt!).getTime() < priorDate)
    .reduce((s, t) => s.plus(t.netPnl ?? "0"), D());
  const priorFlows = flows.filter((f) => priorDate !== null && f.date.getTime() < priorDate).reduce((s, f) => s.plus(D(f.amount).mul(f.type === "withdrawal" ? -1 : 1)), D());
  const opening = starting.plus(prior).plus(priorFlows);
  const metrics = summarize(closed, opening.toString());
  // Subgroup balance series are attribution: only the filtered trade outcomes, with external flows shown separately.
  const isAttribution = Boolean(query.symbol || query.strategyId || query.direction || query.confluenceIds !== undefined);
  const filteredFlows = isAttribution ? [] : flows;
  const equity = equitySeries(closed, opening.toString(),
    filteredFlows.filter((f) => !query.from || f.date >= new Date(query.from)), undefined, query.to ? new Date(query.to) : undefined);
  if (closed.length || equity.length) {
    const earliest = equity[0]?.date ?? new Date().toISOString();
    equity.unshift({ date: query.from ? new Date(query.from).toISOString() : new Date(new Date(earliest).getTime() - 1).toISOString(), balance: opening.toNumber(), pnl: 0, cumulativeR: 0, drawdown: 0 });
  }
  const min = query.minSample ?? 5;
  const group = (id: string, name: string, items: LoadedTrade[]) => ({ id, name, ...summarize(items, opening.toString()), sampleWarning: items.length < 20 });
  const groups = (key: (t: LoadedTrade) => string) => {
    const sets = new Map<string, LoadedTrade[]>();
    for (const t of closed) { const k = key(t); sets.set(k, [...(sets.get(k) ?? []), t]); }
    return [...sets.entries()].map(([id, list]) => group(id, id, list));
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
    ...(metrics.rSample < closed.length ? [`${closed.length - metrics.rSample} closed trades have unavailable initial risk and are excluded from R metrics.`] : []),
    "Win rate excludes breakeven outcomes; expectancy is mean realized R including breakeven outcomes with known risk.",
    "Balance is realized only, not mark-to-market equity. External cash flows are not trading profit. Drawdown uses a cash-flow-neutral realized trading series.",
    "Confluence association does not prove causation. Combination rankings prioritize sample size; no statistical superiority is implied.",
    ...(isAttribution ? ["Filtered balance is performance attribution, not an account balance; cash flows are excluded."] : []),
  ];
  res.json(GetAnalyticsResponse.parse({
    isDemo: res.locals.isDemo, currency, metrics, equity,
    monthly: groups(month).sort((a, b) => a.id.localeCompare(b.id)),
    byInstrument: groups((t) => t.symbol),
    byStrategy: groups((t) => t.strategyName ?? "Unassigned"),
    byDirection: groups((t) => t.direction),
    byEmotion: groups((t) => t.emotion || "Not recorded"),
    byGrade: groups((t) => t.grade || "Not graded"),
    confluences: allConfluences.map((c) => ({
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
