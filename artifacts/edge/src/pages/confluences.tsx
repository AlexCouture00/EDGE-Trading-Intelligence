import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useGetAnalytics, useListConfluences, getGetAnalyticsQueryKey, type GetAnalyticsMatchMode } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filter-bar";
import { GroupBars } from "@/components/charts";
import { Caution, ErrorBlock, GroupTable, LoadingBlock, PageHeader, Panel, SampleBadge, Stat } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { money, pf, ratio, rFmt, tone } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Confluences() {
  const { dp, demo } = useMode();
  const { analyticsParams } = useFilters();
  const list = useListConfluences(dp);
  const [sel, setSel] = useState<string[]>([]);
  const [mode, setMode] = useState<GetAnalyticsMatchMode>("containsAll");
  const [minSample, setMinSample] = useState(20);

  const base = useGetAnalytics({ ...analyticsParams, minSample, matchMode: "exact" });
  const params = useMemo(() => ({ ...analyticsParams, minSample, confluenceIds: sel.join(","), matchMode: mode }), [analyticsParams, minSample, sel, mode]);
  const combo = useGetAnalytics(params, { query: { enabled: sel.length > 0, queryKey: getGetAnalyticsQueryKey(params) } });

  const a = base.data;
  const cur = a?.currency ?? "USD";
  const confs = (list.data ?? []).filter((c) => !c.archived).sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
  const cm = combo.data?.metrics;

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Confluences" : "Confluences"} title="What was present when it worked"
        sub="Observed performance of trades that included each confluence. These are associations in your own history — not evidence that a confluence causes better outcomes." />
      <FilterBar />
      <div className="space-y-4">
        <Panel title="Combination lab" meta="Select confluences to isolate trades that match">
          <div className="flex flex-wrap gap-1.5">
            {list.isLoading ? <LoadingBlock rows={1} className="w-full" /> : confs.map((c) => {
              const on = sel.includes(c.id);
              return (
                <button key={c.id} onClick={() => setSel((p) => on ? p.filter((x) => x !== c.id) : [...p, c.id])}
                  className={cn("inline-flex items-center gap-1.5 rounded-md border h-7 px-2.5 text-[12px] transition-all active:scale-[.97]", on ? "border-foreground/35 bg-secondary" : "border-border text-muted-foreground hover:text-foreground")}
                  data-testid={`button-select-confluence-${c.id}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color ?? "#888" }} />{c.name}{on && <Check className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-card-border">
            <div className="grid grid-cols-2 rounded-md border border-border p-0.5 text-[12px]" data-testid="toggle-match-mode">
              {(["containsAll", "exact"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={cn("h-7 px-3 rounded-[4px] transition-colors", mode === m ? "bg-secondary" : "text-muted-foreground hover:text-foreground")} data-testid={`button-mode-${m}`}>
                  {m === "exact" ? "Exactly these" : "Contains all"}
                </button>
              ))}
            </div>
            <span className="text-[11.5px] text-muted-foreground">{mode === "exact" ? "Trades tagged with this precise set and nothing else." : "Trades tagged with at least these, possibly more."}</span>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground ml-auto">
              Min. sample
              <Input type="number" min={1} max={1000} value={minSample} onChange={(e) => setMinSample(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} className="h-7 w-16 num text-[12px] bg-card" data-testid="input-min-sample" />
            </label>
            {sel.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSel([])} data-testid="button-clear-selection"><X className="h-3.5 w-3.5 mr-1" />Clear</Button>}
          </div>
          {sel.length > 0 && (
            <div className="mt-4">
              {combo.isLoading ? <LoadingBlock rows={2} /> : combo.error ? <ErrorBlock error={combo.error} retry={() => combo.refetch()} /> : cm && (
                <>
                  <div className="panel grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] divide-x divide-y divide-card-border bg-background/40">
                    <Stat label="Matching trades" value={<span className="flex items-center gap-2">{cm.totalTrades}<SampleBadge n={cm.totalTrades} min={minSample} /></span>} />
                    <Stat label="Win rate" value={ratio(cm.winRate)} />
                    <Stat label="Avg R" value={rFmt(cm.averageR)} valueClass={tone(cm.averageR)} sub={`n=${cm.rSample}`} />
                    <Stat label="Total R" value={rFmt(cm.totalR)} valueClass={tone(cm.totalR)} />
                    <Stat label="Net P&L" value={money(cm.netPnl, cur, { signed: true })} valueClass={tone(cm.netPnl)} />
                    <Stat label="Profit factor" value={pf(cm)} />
                  </div>
                  {a && <p className="text-[12px] text-muted-foreground mt-3">Baseline for comparison: all {a.metrics.totalTrades} closed trades in scope averaged <span className={tone(a.metrics.averageR)}>{rFmt(a.metrics.averageR)}</span> at {ratio(a.metrics.winRate)} win rate.</p>}
                  {cm.totalTrades < Math.max(20, minSample) && <div className="mt-3"><Caution>{cm.totalTrades === 0 ? "No closed trades match this selection." : `Only ${cm.totalTrades} matching trades. This observed difference from baseline could easily be noise; it does not establish an edge.`}</Caution></div>}
                </>
              )}
            </div>
          )}
        </Panel>

        {base.isLoading ? <LoadingBlock rows={8} /> : base.error ? <ErrorBlock error={base.error} retry={() => base.refetch()} /> : a && (
          <>
            {a.warnings.map((w, i) => <Caution key={i}>{w}</Caution>)}
            <Panel title="Individual confluences" meta={`Each row: closed trades that included it · samples under ${minSample} flagged`}>
              <GroupTable rows={a.confluences} currency={cur} label="Confluence" showColor minSample={minSample}
                onRowClick={(g) => setSel([g.id])}
                empty={<div className="text-sm text-muted-foreground py-8 text-center">No tagged closed trades in scope yet.</div>} />
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="By confluence count" meta="Does stacking more conditions coincide with better results?">
                {a.byConfluenceCount.length > 0 && <GroupBars rows={a.byConfluenceCount} metric="totalR" currency={cur} height={180} />}
                <div className="mt-3"><GroupTable rows={a.byConfluenceCount} currency={cur} label="Count" minSample={minSample} /></div>
              </Panel>
              <Panel title="Observed combinations" meta="Exact sets seen in your trades" bodyClass="p-4 max-h-[520px] overflow-y-auto">
                <GroupTable rows={a.combinations} currency={cur} label="Combination" minSample={minSample}
                  onRowClick={(g) => { if (g.confluenceIds?.length) { setSel(g.confluenceIds); setMode("exact"); window.scrollTo({ top: 0, behavior: "smooth" }); } }} />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
