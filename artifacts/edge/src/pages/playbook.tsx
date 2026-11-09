import { useState } from "react";
import { Link } from "wouter";
import { Pencil } from "lucide-react";
import { useGetAnalytics, useListStrategies, type Strategy } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBlock, LoadingBlock, PageHeader, Panel, R, SampleBadge, WriteGate } from "@/components/kit";
import { StrategyDialog } from "@/components/strategy-dialog";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { ratio } from "@/lib/format";
import { cn } from "@/lib/utils";

function Rules({ title, text }: { title: string; text?: string }) {
  const lines = (text ?? "").split("\n").map((l) => l.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean);
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      {lines.length === 0 ? <p className="text-[12.5px] text-muted-foreground italic">Not written yet.</p> : (
        <ol className="space-y-1.5">
          {lines.map((l, i) => <li key={i} className="flex gap-3 text-[13px] leading-relaxed"><span className="num text-[11px] text-muted-foreground pt-0.5 w-4 shrink-0">{i + 1}</span><span>{l}</span></li>)}
        </ol>
      )}
    </div>
  );
}

export default function Playbook() {
  const { dp, demo, canWrite } = useMode();
  const { analyticsParams } = useFilters();
  const list = useListStrategies(dp);
  const an = useGetAnalytics(analyticsParams);
  const [sel, setSel] = useState<string>("");
  const [editing, setEditing] = useState<Strategy | undefined>();
  const active = (list.data ?? []).filter((s) => !s.archived);
  const s = active.find((x) => x.id === sel) ?? active[0];
  const g = s ? an.data?.byStrategy.find((x) => x.id === s.id) : undefined;

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Playbook" : "Playbook"} title="The rules, as written" sub="Your strategies rendered as a pre-trade checklist. Edit rules on the strategy itself — there is one source of truth." />
      {list.isLoading ? <LoadingBlock rows={6} /> : list.error ? <ErrorBlock error={list.error} retry={() => list.refetch()} /> : !s ? (
        <Panel><Empty title="No playbook yet" body="Define a strategy with entry, exit and risk rules and it will appear here as a checklist." action={<WriteGate><Button size="sm" asChild><Link href="/strategies">Go to strategies</Link></Button></WriteGate>} /></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <nav className="space-y-0.5">
            {active.map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)} className={cn("w-full text-left px-3 py-2 rounded-md text-[13px] transition-colors", x.id === s.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40")} data-testid={`button-playbook-${x.id}`}>
                {x.name}<span className="block text-[10.5px] num opacity-70">{x.timeframe || "Any timeframe"}</span>
              </button>
            ))}
          </nav>
          <article className="panel p-6 md:p-8 rise" key={s.id}>
            <div className="flex items-start justify-between gap-4 pb-6 border-b border-card-border">
              <div>
                <div className="eyebrow mb-2">Strategy · {s.timeframe || "Any timeframe"}</div>
                <h2 className="text-[24px] tracking-tight font-medium">{s.name}</h2>
                {s.description && <p className="text-[13.5px] text-muted-foreground mt-2 max-w-2xl leading-relaxed">{s.description}</p>}
              </div>
              {canWrite && <Button size="sm" variant="outline" onClick={() => setEditing(s)} data-testid="button-edit-playbook"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit rules</Button>}
            </div>
            <div className="grid gap-8 md:grid-cols-3 py-6">
              <Rules title="Entry" text={s.entryRules} />
              <Rules title="Exit" text={s.exitRules} />
              <Rules title="Risk" text={s.riskRules} />
            </div>
            <div className="border-t border-card-border pt-5 flex flex-wrap items-center gap-x-8 gap-y-2 text-[12.5px]">
              <span className="eyebrow">Observed record</span>
              <span className="num flex items-center gap-2">{g?.totalTrades ?? 0} closed {g && <SampleBadge n={g.totalTrades} />}</span>
              <span className="num">Win {ratio(g?.winRate)}</span>
              <span>Avg <R v={g?.averageR} /></span>
              <span className="num">Plan adherence {ratio(g?.ruleAdherence)}</span>
            </div>
          </article>
        </div>
      )}
      <StrategyDialog open={!!editing} onOpenChange={(v) => !v && setEditing(undefined)} strategy={editing} />
    </div>
  );
}
