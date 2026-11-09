import { useMemo } from "react";
import { Link } from "wouter";
import { useGetAnalytics, useGetSettings, useListTrades } from "@workspace/api-client-react";
import { FilterBar } from "@/components/filter-bar";
import { DrawdownChart, Histogram } from "@/components/charts";
import { Caution, Empty, ErrorBlock, LoadingBlock, MIN_SAMPLE, Money, PageHeader, Panel, R, Stat, StatStrip } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { DASH, money, num, pctRaw, rFmt, tone } from "@/lib/format";

export default function Risk() {
  const { demo, dp } = useMode();
  const { analyticsParams, tradeParams, accounts, filters } = useFilters();
  const q = useGetAnalytics(analyticsParams);
  const trades = useListTrades({ ...tradeParams, status: "closed" });
  const settings = useGetSettings(dp);
  const a = q.data;
  const cur = a?.currency ?? "USD";
  const limit = num(settings.data?.riskLimitPercent);

  const stats = useMemo(() => {
    const list = trades.data ?? [];
    const pnl = list.map((t) => num(t.netPnl)).filter((v): v is number => v !== null);
    const rs = list.map((t) => num(t.realizedR)).filter((v): v is number => v !== null);
    let maxLossStreak = 0, run = 0;
    [...list].sort((x, y) => (x.exitAt ?? "").localeCompare(y.exitAt ?? "")).forEach((t) => {
      const v = num(t.netPnl) ?? 0;
      run = v < 0 ? run + 1 : 0;
      maxLossStreak = Math.max(maxLossStreak, run);
    });
    const buckets = [
      { bucket: "< -2R", lo: -Infinity, hi: -2 }, { bucket: "-2 to -1", lo: -2, hi: -1 }, { bucket: "-1 to 0", lo: -1, hi: 0 },
      { bucket: "0 to 1", lo: 0, hi: 1 }, { bucket: "1 to 2", lo: 1, hi: 2 }, { bucket: "2 to 3", lo: 2, hi: 3 }, { bucket: "> 3R", lo: 3, hi: Infinity },
    ].map((b) => ({ bucket: b.bucket, count: rs.filter((r) => r >= b.lo && r < b.hi).length, positive: b.lo >= 0 }));
    // Risk as % of account balance at time of query (approximation using current realized balance)
    const riskPct = list.map((t) => {
      const acct = accounts.find((x) => x.id === t.accountId);
      const r = num(t.initialRisk), bal = num(acct?.balance);
      return r && bal ? (r / bal) * 100 : null;
    }).filter((v): v is number => v !== null);
    const over = limit ? riskPct.filter((p) => p > limit).length : 0;
    return {
      worst: pnl.length ? Math.min(...pnl) : null, best: pnl.length ? Math.max(...pnl) : null,
      worstR: rs.length ? Math.min(...rs) : null, maxLossStreak, buckets, rsN: rs.length,
      avgRiskPct: riskPct.length ? riskPct.reduce((s, v) => s + v, 0) / riskPct.length : null, riskN: riskPct.length, over,
    };
  }, [trades.data, accounts, limit]);

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Risk" : "Risk"} title="Observed risk" sub="What your realized history shows about drawdown and loss clustering. No simulations or projections — only what happened." />
      <FilterBar />
      {q.isLoading ? <LoadingBlock rows={10} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !a || a.metrics.totalTrades === 0 ? (
        <Panel><Empty title="No closed trades in scope" body="Drawdown and loss statistics need closed trades." /></Panel>
      ) : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label="Max drawdown" value={money(a.metrics.maxDrawdown, cur)} valueClass={num(a.metrics.maxDrawdown) ? "text-neg" : ""} sub="Peak-to-trough, realized" />
            <Stat label="Max DD %" value={pctRaw(a.metrics.maxDrawdownPercent)} sub="Of running peak balance" />
            <Stat label="Worst trade" value={money(stats.worst, cur, { signed: true })} valueClass={tone(stats.worst)} />
            <Stat label="Best trade" value={money(stats.best, cur, { signed: true })} valueClass={tone(stats.best)} />
            <Stat label="Worst R" value={rFmt(stats.worstR)} valueClass={tone(stats.worstR)} sub={stats.worstR !== null && stats.worstR < -1.1 ? "Loss exceeded planned risk" : undefined} />
            <Stat label="Longest losing run" value={stats.maxLossStreak} sub="Consecutive losses" />
            <Stat label="Avg risk / trade" value={stats.avgRiskPct === null ? DASH : `${stats.avgRiskPct.toFixed(2)}%`} sub={`vs current balance · n=${stats.riskN}`} hint="Initial risk divided by the account's current realized balance. An approximation — balance at the time of each trade is not reconstructed." />
            <Stat label="Risk limit" value={limit === null ? DASH : `${limit}%`} sub={limit ? `${stats.over} trade${stats.over === 1 ? "" : "s"} above` : "Set in settings"} valueClass={stats.over ? "text-caution" : ""} />
          </StatStrip>
          {a.metrics.totalTrades < MIN_SAMPLE && <Caution>Drawdown observed over {a.metrics.totalTrades} trades understates what a longer run could produce. Treat it as a floor, not a ceiling.</Caution>}
          {!filters.accountId && <Caution>Drawdown across multiple accounts combines balances. Select a single account for a cleaner read.</Caution>}
          <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
            <Panel title="Underwater curve" meta="Distance below prior realized peak"><DrawdownChart data={a.equity} currency={cur} height={240} /></Panel>
            <Panel title="R distribution" meta={`${stats.rsN} trades with initial risk`}>
              {trades.isLoading ? <LoadingBlock rows={4} /> : stats.rsN === 0 ? <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-6">Record initial risk on trades to see how outcomes distribute in R.</div> : <Histogram data={stats.buckets} height={240} />}
            </Panel>
          </div>
          <Panel title="Largest losses" bodyClass="p-0">
            {(trades.data ?? []).filter((t) => (num(t.netPnl) ?? 0) < 0).sort((x, y) => (num(x.netPnl) ?? 0) - (num(y.netPnl) ?? 0)).slice(0, 6).map((t) => (
              <Link key={t.id} href={`/trades/${t.id}`} className="grid grid-cols-[1fr_auto_auto] gap-6 px-4 py-2.5 border-b border-card-border/60 last:border-0 text-[12.5px] row-hover">
                <span>{t.symbol} <span className="text-muted-foreground">· {t.strategyName ?? "No strategy"}</span></span>
                <Money v={t.netPnl} currency={t.currency} /><R v={t.realizedR} className="w-16 text-right" />
              </Link>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
