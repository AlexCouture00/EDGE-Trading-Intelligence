import { useGetAnalytics } from "@workspace/api-client-react";
import { FilterBar } from "@/components/filter-bar";
import { TemporalPerformance } from "@/components/temporal-performance";
import { MfePerformance } from "@/components/mfe-performance";
import { GroupBars, RChart } from "@/components/charts";
import { Caution, Empty, ErrorBlock, GroupTable, LoadingBlock, PageHeader, Panel, Stat, StatStrip } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { hours, pf, ratio, rFmt, tone } from "@/lib/format";
import { monthLabel } from "@/lib/month-label";

export default function Performance() {
  const { demo } = useMode();
  const { analyticsParams, scopeLabel } = useFilters();
  const q = useGetAnalytics(analyticsParams);
  const a = q.data;
  const cur = a?.currency ?? "USD";
  const monthly = a?.monthly.map(row => ({ ...row, name: monthLabel(row.id) })) ?? [];

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Performance" : "Performance"} title="Realized performance" sub={<>R curve and breakdowns for {scopeLabel}. Closed trade results only, measured in units of planned risk.</>} />
      <FilterBar />
      {q.isLoading ? <LoadingBlock rows={10} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !a || a.metrics.totalTrades === 0 ? (
        <Panel><Empty title="No closed trades in scope" body="Performance breakdowns appear once trades are closed within the current filters." /></Panel>
      ) : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label="Trades" value={a.metrics.totalTrades} sub={`${a.openTrades} open, excluded`} />
            <Stat label="Win rate" value={ratio(a.metrics.winRate)} />
            <Stat label="Profit factor (R)" value={pf(a.metrics)} />
            <Stat label="Avg R" value={rFmt(a.metrics.averageR)} valueClass={tone(a.metrics.averageR)} />
            <Stat label="Median R" value={rFmt(a.metrics.medianR)} valueClass={tone(a.metrics.medianR)} />
            <Stat label="Total R" value={rFmt(a.metrics.rSample ? a.metrics.totalR : null)} valueClass={tone(a.metrics.totalR)} />
            <Stat label="Avg hold" value={hours(a.metrics.averageHoldHours)} />
          </StatStrip>
          <MfePerformance data={a.mfe} />
          {a.warnings.map((w, i) => <Caution key={i}>{w}</Caution>)}
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Cumulative R" meta={`${a.metrics.rSample} of ${a.metrics.totalTrades} trades have recorded R`}><RChart data={a.equity} height={240} /></Panel>
          </div>
          <Panel title="Monthly" meta="By exit month">
            <GroupBars rows={monthly} metric="totalR" currency={cur} height={200} />
            <div className="mt-3"><GroupTable rows={monthly} currency={cur} label="Month" /></div>
          </Panel>
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <Panel title="By instrument"><GroupTable rows={a.byInstrument} currency={cur} label="Symbol" /></Panel>
            <Panel title="By direction"><GroupTable rows={a.byDirection} currency={cur} label="Side" /></Panel>
          </div>
          <TemporalPerformance temporal={a.temporal} bySession={a.bySession} currency={cur} />
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="By market regime" meta="Closed trades · current filters · results in R">
              <GroupTable rows={a.byRegime ?? []} currency={cur} label="Market regime" />
            </Panel>
            <Panel title="By volatility" meta="Closed trades · current filters · results in R">
              <GroupTable rows={a.byVolatility ?? []} currency={cur} label="Volatility" />
            </Panel>
          </div>
          <Panel title="By Market regime + volatility" meta="Combined conditions · closed trades · current filters · results in R">
            <GroupTable rows={a.byRegimeVolatility ?? []} currency={cur} label="Market regime · Volatility" />
          </Panel>
        </div>
      )}
    </div>
  );
}
