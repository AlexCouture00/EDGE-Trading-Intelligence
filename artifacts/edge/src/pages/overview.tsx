import { Link } from "wouter";
import { ArrowUpRight, Plus } from "lucide-react";
import { useGetAnalytics } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filter-bar";
import { RChart } from "@/components/charts";
import { maxRDrawdown } from "@/lib/journal-r";
import { Caution, DirPill, Empty, ErrorBlock, LoadingBlock, MIN_SAMPLE, PageHeader, Panel, R, SampleBadge, Stat, StatStrip, WriteGate } from "@/components/kit";
import { Onboarding } from "@/components/onboarding";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { hours, pf, ratio, rFmt, tone } from "@/lib/format";
import { useDateFormatter } from "@/lib/time";

export default function Overview() {
  const dt = useDateFormatter();
  const { demo } = useMode();
  const { analyticsParams, scopeLabel, accounts, accountsLoading, accountsError, refetchAccounts } = useFilters();
  const q = useGetAnalytics(analyticsParams);

  if (accountsLoading) return <LoadingBlock rows={6} />;
  if (accountsError) return <ErrorBlock error={accountsError} retry={refetchAccounts} />;
  if (!demo && accounts.length === 0) return <Onboarding />;

  const a = q.data;
  const m = a?.metrics;

  return (
    <div>
      <PageHeader
        eyebrow={demo ? "Demo workspace · Overview" : "Overview"}
        title="Where your edge stands"
        sub={<>Realized results for <span className="text-foreground/90">{scopeLabel}</span>. Dated by exit; open positions counted separately.</>}
        actions={<WriteGate><Button size="sm" asChild><Link href="/trades/new" data-testid="link-overview-new-trade"><Plus className="h-3.5 w-3.5 mr-1.5" />Log trade</Link></Button></WriteGate>}
      />
      <FilterBar />
      {q.isLoading ? <LoadingBlock rows={8} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : a && m ? (
        <div className="space-y-4">
          {m.totalTrades === 0 ? (
            <Panel>
              <Empty title="No closed trades in this scope" body={a.openTrades ? `${a.openTrades} open position${a.openTrades === 1 ? "" : "s"} — analytics begin once a trade is closed.` : "Adjust filters, or log a closed trade to start building your sample."}
                action={<WriteGate><Button size="sm" asChild><Link href="/trades/new">Log a trade</Link></Button></WriteGate>} />
            </Panel>
          ) : (
            <>
              <StatStrip>
                <Stat label="Closed trades" value={m.totalTrades} testId="stat-closed-trades" />
                <Stat label="Win rate" value={ratio(m.winRate)} sub={`${m.wins}W · ${m.losses}L · ${m.breakeven}BE`} testId="stat-win-rate" />
                <Stat label="Profit factor (R)" value={pf(m)} sub={m.profitFactorInfinite ? "No losing R outcomes yet" : "Winning R / losing R"} testId="stat-pf" />
                <Stat label="Avg R" value={rFmt(m.averageR)} valueClass={tone(m.averageR)} sub={`Median ${rFmt(m.medianR)} · n=${m.rSample}`} testId="stat-avg-r" hint="Includes directly entered R and historical R calculated from recorded initial risk. Trades without R are excluded." />
                <Stat label="Total R" value={rFmt(m.rSample ? m.totalR : null)} valueClass={tone(m.totalR)} testId="stat-total-r" />
                <Stat label="Max drawdown" value={m.rSample ? rFmt(-maxRDrawdown(a.equity)) : "—"} valueClass={maxRDrawdown(a.equity) ? "text-neg" : ""} sub="From cumulative R peak" testId="stat-max-dd" />
                <Stat label="Plan adherence" value={ratio(m.ruleAdherence)} sub="Followed plan" testId="stat-adherence" />
                <Stat label="Open" value={a.openTrades} sub="Not in metrics" testId="stat-open" />
              </StatStrip>
              {m.totalTrades < MIN_SAMPLE && (
                <Caution>{m.totalTrades} closed trades in scope. Below {MIN_SAMPLE}, every figure here describes what happened — not what is likely to keep happening.</Caution>
              )}
              {a.warnings.map((w, i) => <Caution key={i}>{w}</Caution>)}
              <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
                <Panel title="Cumulative R" meta="Closed trades with a recorded R result" actions={<Link href="/performance" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="link-to-performance">Performance <ArrowUpRight className="h-3 w-3" /></Link>}>
                  {m.rSample ? <RChart data={a.equity} /> : <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">No recorded R results in this scope.</div>}
                </Panel>
                <Panel title="Confluences, observed" meta="Association, not causation" bodyClass="p-0" actions={<Link href="/performance#by-confluence" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="link-to-confluences">Analyze <ArrowUpRight className="h-3 w-3" /></Link>}>
                  {a.confluences.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Tag confluences on trades to see them here.</div> : (
                    <ul>
                      {[...a.confluences].sort((x, y) => (y.averageR ?? -99) - (x.averageR ?? -99)).slice(0, 7).map((c) => (
                        <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-card-border/60 last:border-0 text-[12.5px]">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.color ?? "hsl(var(--muted-foreground))" }} />
                          <span className="flex-1 truncate">{c.name}</span>
                          <SampleBadge n={c.totalTrades} />
                          <span className="num text-muted-foreground w-8 text-right">{c.totalTrades}</span>
                          <R v={c.averageR} className="w-16 text-right" />
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Stat label="Average hold" value={hours(m.averageHoldHours)} />
                <Stat label="Current streak" value={m.streak === 0 ? "—" : `${Math.abs(m.streak)} ${m.streak > 0 ? "wins" : "losses"}`} valueClass={tone(m.streak)} />
                <Stat label="R coverage" value={`${m.rSample}/${m.totalTrades}`} sub="Trades with a recorded R result" />
              </div>
            </>
          )}
          <Panel title="Recent trades" bodyClass="p-0" actions={<Link href="/journal" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="link-to-journal">Journal <ArrowUpRight className="h-3 w-3" /></Link>}>
            {a.recentTrades.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No trades yet.</div> : (
              <div className="divide-y divide-card-border/60">
                {a.recentTrades.slice(0, 8).map((t) => (
                  <Link key={t.id} href={`/trades/${t.id}`} className="grid grid-cols-[1fr_auto] md:grid-cols-[140px_90px_60px_1fr_80px] gap-3 items-center px-4 py-2.5 text-[12.5px] row-hover" data-testid={`link-recent-${t.id}`}>
                    <span className="num text-muted-foreground hidden md:block">{dt(t.exitAt ?? t.entryAt, "dd MMM yy HH:mm")}</span>
                    <span className="font-medium">{t.symbol || "Untitled"}</span>
                    <span className="hidden md:block"><DirPill d={t.direction} /></span>
                    <span className="text-muted-foreground truncate hidden md:block">{t.strategyName ?? "No strategy"}</span>
                    <R v={t.realizedR} className="text-right" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
