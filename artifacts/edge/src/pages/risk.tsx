import { useMemo } from "react";
import { Link } from "wouter";
import { useGetAnalytics, useListTrades } from "@workspace/api-client-react";
import { FilterBar } from "@/components/filter-bar";
import { DrawdownChart, Histogram } from "@/components/charts";
import { Caution, Empty, ErrorBlock, LoadingBlock, MIN_SAMPLE, Money, PageHeader, Panel, R, Stat, StatStrip } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { money, num, rFmt, tone } from "@/lib/format";

export default function Risk() {
  const { demo } = useMode();
  const { analyticsParams, tradeParams } = useFilters();
  const q = useGetAnalytics(analyticsParams);
  const trades = useListTrades({ ...tradeParams, status: "closed" });
  const a = q.data;
  const cur = a?.currency ?? "USD";

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
    const risks = list.map(t => num(t.initialRisk)).filter((v): v is number => v !== null);
    return {
      worst: pnl.length ? Math.min(...pnl) : null, best: pnl.length ? Math.max(...pnl) : null,
      worstR: rs.length ? Math.min(...rs) : null, maxLossStreak, buckets, rsN: rs.length,
      avgRisk: risks.length ? risks.reduce((s, v) => s + v, 0) / risks.length : null, riskN: risks.length,
    };
  }, [trades.data]);

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Risk" : "Risk"} title="Observed risk" sub="What your realized history shows about drawdown and loss clustering. No simulations or projections — only what happened." />
      <FilterBar />
      {q.isLoading || trades.isLoading ? <LoadingBlock rows={10} /> : q.error || trades.error ? <ErrorBlock error={q.error ?? trades.error} retry={() => { void q.refetch(); void trades.refetch(); }} /> : !a || a.metrics.totalTrades === 0 ? (
        <Panel><Empty title="No closed trades in scope" body="Drawdown and loss statistics need closed trades." /></Panel>
      ) : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label="Max drawdown" value={money(a.metrics.maxDrawdown, cur)} valueClass={num(a.metrics.maxDrawdown) ? "text-neg" : ""} sub="Peak-to-trough, realized" />
            <Stat label="Worst trade" value={money(stats.worst, cur, { signed: true })} valueClass={tone(stats.worst)} />
            <Stat label="Best trade" value={money(stats.best, cur, { signed: true })} valueClass={tone(stats.best)} />
            <Stat label="Worst R" value={rFmt(stats.worstR)} valueClass={tone(stats.worstR)} sub={stats.worstR !== null && stats.worstR < -1.1 ? "Loss exceeded planned risk" : undefined} />
            <Stat label="Longest losing run" value={stats.maxLossStreak} sub="Consecutive losses" />
            <Stat label="Avg initial risk" value={money(stats.avgRisk, cur)} sub={`Recorded on ${stats.riskN} trades`} hint="Average recorded initial risk in the trade currency, not a percentage of an account balance." />
          </StatStrip>
          {a.metrics.totalTrades < MIN_SAMPLE && <Caution>Drawdown observed over {a.metrics.totalTrades} trades understates what a longer run could produce. Treat it as a floor, not a ceiling.</Caution>}
          <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
            <Panel title="Underwater curve" meta="Distance below prior trading P&L peak"><DrawdownChart data={a.equity} currency={cur} height={240} /></Panel>
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
