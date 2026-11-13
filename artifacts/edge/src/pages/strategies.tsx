import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useGetAnalytics, useListStrategies, useUpdateStrategy, type Strategy } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filter-bar";
import { GroupBars } from "@/components/charts";
import { Empty, ErrorBlock, GroupTable, LoadingBlock, Money, PageHeader, Panel, R, SampleBadge, WriteGate } from "@/components/kit";
import { StrategyDialog } from "@/components/strategy-dialog";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { useToast } from "@/hooks/use-toast";
import { errMsg, pf, ratio } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Strategies() {
  const { dp, demo, canWrite } = useMode();
  const { analyticsParams } = useFilters();
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListStrategies(dp);
  const an = useGetAnalytics(analyticsParams);
  const upd = useUpdateStrategy();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Strategy | undefined>();
  const [showArchived, setShowArchived] = useState(false);
  const cur = an.data?.currency ?? "USD";

  const toggleArchive = (s: Strategy) => upd.mutate({ id: s.id, data: { name: s.name, description: s.description, entryRules: s.entryRules, exitRules: s.exitRules, riskRules: s.riskRules, timeframe: s.timeframe, archived: !s.archived } }, {
    onSuccess: () => { void qc.invalidateQueries(); toast({ title: s.archived ? "Strategy restored" : "Strategy archived" }); },
    onError: (e) => toast({ title: "Update failed", description: errMsg(e), variant: "destructive" }),
  });

  const strategies = (list.data ?? []).filter((s) => showArchived || !s.archived);
  const byId = new Map((an.data?.byStrategy ?? []).map((g) => [g.id, g]));

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Strategies" : "Strategies"} title="Method versus outcome"
        sub="Performance by strategy, alongside the rules each one is supposed to follow."
        actions={<>
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)} data-testid="button-toggle-archived">{showArchived ? "Hide archived" : "Show archived"}</Button>
          <WriteGate><Button size="sm" onClick={() => { setEditing(undefined); setOpen(true); }} data-testid="button-new-strategy"><Plus className="h-3.5 w-3.5 mr-1.5" />New strategy</Button></WriteGate>
        </>} />
      <FilterBar />
      {an.data && an.data.byStrategy.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[1fr_420px] mb-4">
          <Panel title="Strategy performance" meta="Closed trades in scope"><GroupTable rows={an.data.byStrategy} currency={cur} label="Strategy" /></Panel>
          <Panel title="Total R by strategy" meta="0R totals have no visible bar; exact values are in the table."><GroupBars rows={an.data.byStrategy} metric="totalR" currency={cur} height={200} /></Panel>
        </div>
      )}
      {list.isLoading ? <LoadingBlock rows={6} /> : list.error ? <ErrorBlock error={list.error} retry={() => list.refetch()} /> : strategies.length === 0 ? (
        <Panel><Empty title="No strategies defined" body="A strategy is a named set of entry, exit and risk rules. Tag trades with one to compare methods." action={<WriteGate><Button size="sm" onClick={() => setOpen(true)}>Define a strategy</Button></WriteGate>} /></Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {strategies.map((s) => {
            const g = byId.get(s.id);
            return (
              <div key={s.id} className={cn("panel p-4 rise flex flex-col gap-3", s.archived && "opacity-60")} data-testid={`card-strategy-${s.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><h3 className="text-[15px] font-medium truncate">{s.name}</h3>{s.timeframe && <span className="num text-[10.5px] border border-border rounded-sm px-1.5">{s.timeframe}</span>}{s.archived && <span className="eyebrow">Archived</span>}</div>
                    {s.description && <p className="text-[12.5px] text-muted-foreground mt-1 line-clamp-2">{s.description}</p>}
                  </div>
                  {canWrite && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(s); setOpen(true); }} data-testid={`button-edit-strategy-${s.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleArchive(s)} title={s.archived ? "Restore" : "Archive"} data-testid={`button-archive-strategy-${s.id}`}>{s.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px] border-t border-card-border pt-3">
                  <div><div className="eyebrow">Trades</div><div className="num mt-1 flex items-center gap-1.5">{g?.totalTrades ?? 0}{g && <SampleBadge n={g.totalTrades} />}</div></div>
                  <div><div className="eyebrow">Win</div><div className="num mt-1">{ratio(g?.winRate)}</div></div>
                  <div><div className="eyebrow">Avg R</div><div className="mt-1"><R v={g?.averageR} /></div></div>
                  <div><div className="eyebrow">Total R</div><div className="mt-1"><R v={g && g.rSample > 0 ? g.totalR : null} /></div></div>
                  <div><div className="eyebrow">Net</div><div className="mt-1">{g ? <Money v={g.netPnl} currency={cur} /> : <span className="num">—</span>}</div></div>
                </div>
                <div className="text-[11px] text-muted-foreground">PF {g ? pf(g) : "—"} · {[s.entryRules, s.exitRules, s.riskRules].filter(Boolean).length}/3 rule sets written</div>
              </div>
            );
          })}
        </div>
      )}
      <StrategyDialog open={open} onOpenChange={setOpen} strategy={editing} />
    </div>
  );
}
