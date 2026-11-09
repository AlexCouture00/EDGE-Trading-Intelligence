import { useMemo } from "react";
import { useGetAnalytics, useListTrades } from "@workspace/api-client-react";
import { FilterBar } from "@/components/filter-bar";
import { Caution, Empty, ErrorBlock, GroupTable, LoadingBlock, PageHeader, Panel, R, SampleBadge, Stat, StatStrip } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { num, ratio, rFmt, tone } from "@/lib/format";

export default function Psychology() {
  const { demo } = useMode();
  const { analyticsParams, tradeParams } = useFilters();
  const q = useGetAnalytics(analyticsParams);
  const trades = useListTrades({ ...tradeParams, status: "closed" });
  const a = q.data;
  const cur = a?.currency ?? "USD";

  const derived = useMemo(() => {
    const list = trades.data ?? [];
    const plan = (v: boolean) => {
      const s = list.filter((t) => t.followedPlan === v);
      const rs = s.map((t) => num(t.realizedR)).filter((x): x is number => x !== null);
      return { n: s.length, avgR: rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : null, rN: rs.length };
    };
    const tags = new Map<string, { n: number; rs: number[]; net: number }>();
    list.forEach((t) => (t.behavioralTags ?? []).forEach((tag) => {
      const k = tag.trim().toLowerCase(); if (!k) return;
      const e = tags.get(k) ?? { n: 0, rs: [], net: 0 };
      e.n++; e.net += num(t.netPnl) ?? 0;
      const r = num(t.realizedR); if (r !== null) e.rs.push(r);
      tags.set(k, e);
    }));
    const conf = [1, 2, 3, 4, 5].map((c) => {
      const s = list.filter((t) => t.confidence === c);
      const rs = s.map((t) => num(t.realizedR)).filter((x): x is number => x !== null);
      return { c, n: s.length, avgR: rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : null };
    });
    return {
      yes: plan(true), no: plan(false), unknown: list.filter((t) => t.followedPlan === undefined || t.followedPlan === null).length,
      tags: Array.from(tags.entries()).map(([k, v]) => ({ tag: k, n: v.n, net: v.net, avgR: v.rs.length ? v.rs.reduce((x, y) => x + y, 0) / v.rs.length : null })).sort((x, y) => y.n - x.n),
      conf,
    };
  }, [trades.data]);

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Psychology" : "Psychology"} title="Behavior under pressure" sub="How your recorded state and execution quality line up with outcomes. Self-reported data is only as honest as the entries." />
      <FilterBar />
      {q.isLoading ? <LoadingBlock rows={10} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !a || a.metrics.totalTrades === 0 ? (
        <Panel><Empty title="No closed trades in scope" body="Record emotion, grade and whether you followed the plan on each trade to populate this view." /></Panel>
      ) : (
        <div className="space-y-4">
          <StatStrip className="xl:grid-cols-4">
            <Stat label="Plan adherence" value={ratio(a.metrics.ruleAdherence)} sub={`${derived.unknown} trades unrecorded`} />
            <Stat label="Followed plan · avg R" value={rFmt(derived.yes.avgR)} valueClass={tone(derived.yes.avgR)} sub={`${derived.yes.n} trades`} />
            <Stat label="Broke plan · avg R" value={rFmt(derived.no.avgR)} valueClass={tone(derived.no.avgR)} sub={`${derived.no.n} trades`} />
            <Stat label="Gap" value={derived.yes.avgR !== null && derived.no.avgR !== null ? rFmt(derived.yes.avgR - derived.no.avgR) : "—"} sub="Observed, per trade" />
          </StatStrip>
          {(derived.no.n < 5 || derived.yes.n < 5) && derived.no.n + derived.yes.n > 0 && <Caution>One side of the plan comparison has fewer than five trades. The gap above is anecdotal for now.</Caution>}
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="By execution grade"><GroupTable rows={a.byGrade} currency={cur} label="Grade" /></Panel>
            <Panel title="By emotion"><GroupTable rows={a.byEmotion} currency={cur} label="Emotion" /></Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
            <Panel title="Behavioral tags" meta="Frequency and observed outcome" bodyClass="p-0">
              {trades.isLoading ? <div className="p-4"><LoadingBlock rows={4} /></div> : derived.tags.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No behavioral tags recorded. Tags like "moved stop" or "early exit" make patterns visible.</div> : (
                <table className="w-full text-[12.5px]">
                  <thead><tr className="text-left text-muted-foreground border-b border-card-border"><th className="font-normal px-4 py-2">Tag</th><th className="font-normal px-3 py-2 text-right">Trades</th><th className="font-normal px-4 py-2 text-right">Avg R</th></tr></thead>
                  <tbody>{derived.tags.slice(0, 14).map((t) => (
                    <tr key={t.tag} className="border-b border-card-border/60 last:border-0 row-hover"><td className="px-4 py-2.5 capitalize"><span className="flex items-center gap-2">{t.tag}<SampleBadge n={t.n} /></span></td><td className="px-3 py-2.5 text-right num">{t.n}</td><td className="px-4 py-2.5 text-right"><R v={t.avgR} /></td></tr>
                  ))}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Confidence vs outcome" meta="Self-rated 1-5">
              <div className="space-y-2">
                {derived.conf.map((c) => {
                  const w = c.avgR === null ? 0 : Math.min(100, Math.abs(c.avgR) * 40);
                  return (
                    <div key={c.c} className="grid grid-cols-[24px_1fr_70px_36px] items-center gap-3 text-[12px]">
                      <span className="num text-muted-foreground">{c.c}</span>
                      <div className="h-5 bg-background/60 rounded-sm relative overflow-hidden"><div className="absolute inset-y-0 left-0 origin-left transition-transform duration-700" style={{ width: `${w}%`, background: (c.avgR ?? 0) >= 0 ? "hsl(var(--pos) / .5)" : "hsl(var(--neg) / .5)" }} /></div>
                      <R v={c.avgR} className="text-right" />
                      <span className="num text-muted-foreground text-right">{c.n}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
