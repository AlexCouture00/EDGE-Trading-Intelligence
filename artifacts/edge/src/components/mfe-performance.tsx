import type { MfeAnalytics, MfeGroup } from "@workspace/api-client-react";
import { Panel, Stat, StatStrip } from "@/components/kit";
import { rFmt } from "@/lib/format";

function MfeTable({ rows, label }: { rows: MfeGroup[]; label: string }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-xs num">
      <thead><tr className="text-muted-foreground text-right border-b border-card-border">
        {[label, "Paired / closed", "Avg MFE", "Avg realized", "Avg gap"].map((title, i) =>
          <th key={title} scope="col" className={`font-normal px-3 py-2 whitespace-nowrap ${i === 0 ? "text-left" : ""}`}>{title}</th>)}
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-b border-card-border/60 last:border-0 text-right">
        <th scope="row" className="font-normal text-left px-3 py-3">{row.name}{row.pairedCount < 20 && <span className="block text-[10px] text-muted-foreground">Small sample</span>}</th>
        <td className="px-3 py-3">{row.pairedCount} / {row.totalTrades}</td>
        <td className="px-3 py-3 whitespace-nowrap">{rFmt(row.averageMfeR)}</td>
        <td className="px-3 py-3 whitespace-nowrap">{rFmt(row.averageRealizedR)}</td>
        <td className="px-3 py-3 whitespace-nowrap">{rFmt(row.averageGivebackR)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function MfePerformance({ data }: { data?: MfeAnalytics }) {
  const m = data?.overall;
  return <Panel title="MFE vs realized R" meta="Closed trades · current filters" >
    <p className="text-xs text-muted-foreground mb-4">Compare how far trades moved in your favor while open with their final net result. All averages use only the same trades with both MFE and realized R recorded. Unknown MFE is excluded, never treated as zero.</p>
    {!m || !m.recordedCount ? <p className="text-sm text-muted-foreground" data-testid="mfe-empty">No MFE recorded for closed trades in this scope. Add it when logging or reviewing a trade.</p> : <>
      <StatStrip>
        <Stat label="MFE recorded" value={`${m.recordedCount} / ${m.totalTrades}`} />
        <Stat label="Comparable trades" value={m.pairedCount} />
        <Stat label="Avg MFE" value={rFmt(m.averageMfeR)} />
        <Stat label="Avg realized R" value={rFmt(m.averageRealizedR)} />
        <Stat label="Avg gap" value={rFmt(m.averageGivebackR)} />
      </StatStrip>
      <div className="grid gap-5 xl:grid-cols-2 mt-5">
        <div><h3 className="eyebrow mb-2">By market regime</h3><MfeTable rows={data!.byRegime} label="Regime" /></div>
        <div><h3 className="eyebrow mb-2">By volatility</h3><MfeTable rows={data!.byVolatility} label="Volatility" /></div>
      </div>
      <div className="mt-5"><h3 className="eyebrow mb-2">Market regime × volatility</h3><MfeTable rows={data!.byContext} label="Context" /></div>
    </>}
    <p className="text-[11px] text-muted-foreground mt-4">Gap = MFE − realized R, averaged trade by trade. It measures retracement, not profit you could necessarily have captured. A larger gap alone does not prove you exited too early. Preset estimates and small samples limit conclusions.</p>
  </Panel>;
}
