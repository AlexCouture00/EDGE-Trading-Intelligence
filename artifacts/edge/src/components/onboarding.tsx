import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";
import { useCreateStrategy, useListConfluences, useListStrategies } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { cn } from "@/lib/utils";

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode }) {
  return (
    <div className={cn("panel transition-opacity", !active && !done && "opacity-50")}>
      <div className="flex items-center gap-3 px-5 h-12 border-b border-card-border">
        <span className={cn("h-5 w-5 rounded-full border flex items-center justify-center num text-[10px]", done ? "bg-[hsl(var(--pos)/.15)] border-[hsl(var(--pos)/.4)] text-pos" : "border-border text-muted-foreground")}>
          {done ? <Check className="h-3 w-3" /> : n}
        </span>
        <span className="text-[13.5px] font-medium">{title}</span>
      </div>
      {(active || done) && <div className="p-5">{children}</div>}
    </div>
  );
}

export function Onboarding() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const conf = useListConfluences();
  const strat = useListStrategies();
  const createStrategy = useCreateStrategy();

  const [st, setSt] = useState({ name: "", entryRules: "", timeframe: "" });

  const confCount = (conf.data ?? []).filter((c) => !c.archived).length;
  const hasStrategy = (strat.data ?? []).length > 0;

  const saveStrategy = () => {
    if (!st.name.trim()) return;
    createStrategy.mutate({ data: { name: st.name.trim(), entryRules: st.entryRules, timeframe: st.timeframe } }, {
      onSuccess: () => { void qc.invalidateQueries(); toast({ title: "Strategy saved" }); },
      onError: (e) => toast({ title: "Could not save strategy", description: errMsg(e), variant: "destructive" }),
    });
  };

  return (
    <div className="max-w-3xl">
      <div className="pb-8 rise">
        <div className="eyebrow mb-3">Your workspace · empty</div>
        <h1 className="text-[32px] leading-[1.15] tracking-[-0.025em] font-light">Start your trading journal.<br /><span className="text-muted-foreground">No account or balance setup.</span></h1>
        <p className="text-sm text-muted-foreground mt-4 max-w-xl">Log your first trade right away. Confluences and strategies are optional ways to organize your review. Track balances separately in Prop Firm Manager.</p>
      </div>
      <div className="space-y-3">
        <Step n={1} title="Review your confluences (optional)" done={confCount > 0} active>
          <p className="text-sm text-muted-foreground">{conf.isLoading ? "Loading..." : `${confCount} confluences ready.`} These are the conditions you tag on each trade. Rename them to match your own language — EDGE will track how trades that include them performed.</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(conf.data ?? []).filter((c) => !c.archived).slice(0, 12).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[11.5px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color ?? "#888" }} />{c.name}</span>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-4" asChild><Link href="/settings?tab=confluences" data-testid="link-onb-confluences">Edit confluences <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></Link></Button>
        </Step>
        <Step n={2} title="Describe one strategy (optional)" done={hasStrategy} active={!hasStrategy}>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input value={st.name} onChange={(e) => setSt({ ...st, name: e.target.value })} placeholder="London breakout retest" data-testid="input-onb-strategy-name" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Timeframe</Label><Input value={st.timeframe} onChange={(e) => setSt({ ...st, timeframe: e.target.value })} placeholder="H4" data-testid="input-onb-strategy-tf" /></div>
          </div>
          <div className="space-y-1.5 mt-4"><Label className="text-xs text-muted-foreground">Entry rules</Label><Textarea rows={3} value={st.entryRules} onChange={(e) => setSt({ ...st, entryRules: e.target.value })} placeholder="Daily bias aligned; H4 break and close; entry on first retest with M15 rejection." data-testid="input-onb-strategy-rules" /></div>
          {!hasStrategy && <div className="flex gap-2 mt-5"><Button onClick={saveStrategy} disabled={!st.name.trim() || createStrategy.isPending} data-testid="button-onb-create-strategy">Save strategy</Button><Button variant="ghost" asChild><Link href="/strategies">Full editor</Link></Button></div>}
          {hasStrategy && <p className="text-sm text-muted-foreground">{strat.data?.[0]?.name}</p>}
        </Step>
        <Step n={3} title="Log your first trade" done={false} active>
          <p className="text-sm text-muted-foreground mb-4">Drafts are fine. Record the setup before entry, then close it out later — R is measured against the initial risk you lock in when the trade first leaves draft.</p>
          <Button asChild><Link href="/trades/new" data-testid="link-onb-first-trade">Log first trade <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></Link></Button>
        </Step>
      </div>
    </div>
  );
}
