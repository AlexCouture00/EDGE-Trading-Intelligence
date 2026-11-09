import { useGetAnalytics } from "@workspace/api-client-react";
import { FilterBar } from "@/components/filter-bar";
import { EquityChart, GroupBars, RChart } from "@/components/charts";
import { Caution, Empty, ErrorBlock, GroupTable, LoadingBlock, PageHeader, Panel, Stat, StatStrip } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { hours, money, pf, ratio, rFmt, tone } from "@/lib/format";

export default function Performance() {
  const { demo } = useMode();
  const { analyticsParams, scopeLabel } = useFilters();
  const q = useGetAnalytics(analyticsParams);
  const a = q.data;
  const cur = a?.currency ?? "USD";

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Performance" : "Performance"} title="Realized performance" sub={<>Balance curve, R curve and breakdowns for {scopeLabel}. Curves use realized balance — closed trades and cash flows — never live mark-to-market.</>} />
      <FilterBar />
      {q.isLoading ? <LoadingBlock rows={10} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !a || a.metrics.totalTrades === 0 ? (
        <Panel><Empty title="No closed trades in scope" body="Performance breakdowns appear once trades are closed within the current filters." /></Panel>
      ) : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label="Net P&L" value={money(a.metrics.netPnl, cur, { signed: true })} valueClass={tone(a.metrics.netPnl)} />
            <Stat label="Trades" value={a.metrics.totalTrades} sub={`${a.openTrades} open, excluded`} />
            <Stat label="Win rate" value={ratio(a.metrics.winRate)} />
            <Stat label="Profit factor" value={pf(a.metrics)} />
            <Stat label="Avg R" value={rFmt(a.metrics.averageR)} valueClass={tone(a.metrics.averageR)} />
            <Stat label="Median R" value={rFmt(a.metrics.medianR)} valueClass={tone(a.metrics.medianR)} />
            <Stat label="Total R" value={rFmt(a.metrics.totalR)} valueClass={tone(a.metrics.totalR)} />
            <Stat label="Avg hold" value={hours(a.metrics.averageHoldHours)} />
          </StatStrip>
          {a.warnings.map((w, i) => <Caution key={i}>{w}</Caution>)}
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Realized balance" meta="Not mark-to-market"><EquityChart data={a.equity} currency={cur} height={240} /></Panel>
            <Panel title="Cumulative R" meta={`${a.metrics.rSample} of ${a.metrics.totalTrades} trades have initial risk`}><RChart data={a.equity} height={240} /></Panel>
          </div>
          <Panel title="Monthly" meta="By exit month">
            <GroupBars rows={a.monthly} metric="netPnl" currency={cur} height={200} />
            <div className="mt-3"><GroupTable rows={a.monthly} currency={cur} label="Month" /></div>
          </Panel>
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <Panel title="By instrument"><GroupTable rows={a.byInstrument} currency={cur} label="Symbol" /></Panel>
            <Panel title="By direction"><GroupTable rows={a.byDirection} currency={cur} label="Side" /></Panel>
          </div>
        </div>
      )}
    </div>
  );
}
