import { type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useDeleteTrade, useGetTrade, getGetTradeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DirPill, ErrorBlock, LoadingBlock, Money, Panel, R, StatusPill, WriteGate } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { useMode } from "@/lib/mode";
import { errMsg, hours, money } from "@/lib/format";
import { useDateFormatter, useTimezone } from "@/lib/time";

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-card-border/60 last:border-0 text-[12.5px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="num text-right truncate">{v ?? "—"}</span>
    </div>
  );
}

export default function TradeDetail() {
  const dt = useDateFormatter();
  const timezone = useTimezone();
  const { id = "" } = useParams<{ id: string }>();
  const { dp, canWrite } = useMode();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetTrade(id, dp, { query: { enabled: !!id, queryKey: getGetTradeQueryKey(id, dp) } });
  const del = useDeleteTrade();

  if (q.isLoading) return <LoadingBlock rows={10} />;
  if (q.error || !q.data) return <ErrorBlock error={q.error ?? new Error("Trade not found")} retry={() => q.refetch()} />;
  const t = q.data;
  const hold = t.entryAt && t.exitAt ? (new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 36e5 : null;
  const notes = ([["Thesis", t.thesis], ["Entry reason", t.entryReason], ["Management", t.management], ["Exit reason", t.exitReason], ["What went well", t.wentWell], ["What went wrong", t.wentWrong], ["Lesson", t.lesson]] as const).filter(([, v]) => v);

  const onDelete = () => del.mutate({ id: t.id }, {
    onSuccess: () => { void qc.invalidateQueries(); toast({ title: "Trade deleted" }); nav("/journal"); },
    onError: (e) => toast({ title: "Delete failed", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Link href="/journal" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground" data-testid="link-back-journal"><ArrowLeft className="h-3.5 w-3.5" /> Journal</Link>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 rise">
        <div>
          <div className="flex items-center gap-3 mb-2"><StatusPill status={t.status} /><span className="eyebrow">{t.accountName} · {t.currency}</span></div>
          <h1 className="text-[30px] tracking-[-0.02em] font-medium flex items-baseline gap-3" data-testid="text-trade-symbol">{t.symbol || "Untitled"} <DirPill d={t.direction} /></h1>
          <p className="text-sm text-muted-foreground mt-1">{t.strategyName ?? "No strategy"} · {dt(t.entryAt)}{t.exitAt ? ` → ${dt(t.exitAt)}` : ""} · {timezone}</p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite ? (
            <>
              <Button variant="outline" size="sm" asChild><Link href={`/trades/${t.id}/edit`} data-testid="link-edit-trade"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Link></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-neg" data-testid="button-delete-trade"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
                    <AlertDialogDescription>{t.symbol || "This trade"} will be removed from your journal and every analytic. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Keep</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">Delete trade</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : <WriteGate />}
        </div>
      </div>

      <div className="panel grid grid-cols-2 md:grid-cols-4 divide-x divide-card-border rise">
        <div className="p-4"><div className="eyebrow">Net P&L</div><Money v={t.netPnl} currency={t.currency} className="text-2xl block mt-1.5" /></div>
        <div className="p-4"><div className="eyebrow">Realized R</div><R v={t.realizedR} className="text-2xl block mt-1.5" />{t.realizedR === null && <div className="text-[11px] text-muted-foreground mt-1">{t.initialRisk ? "Not closed" : "No initial risk recorded"}</div>}</div>
        <div className="p-4"><div className="eyebrow">Initial risk</div><div className="num text-2xl mt-1.5">{money(t.initialRisk, t.currency)}</div></div>
        <div className="p-4"><div className="eyebrow">Hold</div><div className="num text-2xl mt-1.5">{hours(hold)}</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 min-w-0">
          <Panel title="Confluences present" meta="Snapshot at time of logging">
            {t.confluences.length === 0 ? <p className="text-sm text-muted-foreground">None tagged.</p> : (
              <div className="flex flex-wrap gap-1.5">{t.confluences.map((c) => <span key={c.id} className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[12px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color ?? "#888" }} />{c.name}</span>)}</div>
            )}
          </Panel>
          <Panel title="Review">
            {notes.length === 0 ? <p className="text-sm text-muted-foreground">No written review yet.{canWrite && " Add one while the trade is still fresh."}</p> : (
              <div className="space-y-5">
                {notes.map(([k, v]) => <div key={k}><div className="eyebrow mb-1.5">{k}</div><p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">{v}</p></div>)}
              </div>
            )}
            {t.chartUrl && <a href={t.chartUrl} target="_blank" rel="noreferrer noopener" className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] text-signal hover:underline" data-testid="link-chart"><ExternalLink className="h-3.5 w-3.5" />Open chart</a>}
          </Panel>
          {t.executions && t.executions.length > 0 && (
            <Panel title="Executions" bodyClass="p-0">
              <table className="w-full text-[12.5px] num">
                <thead><tr className="text-muted-foreground text-left border-b border-card-border"><th className="font-normal px-4 py-2">Kind</th><th className="font-normal px-3 py-2">Time</th><th className="font-normal px-3 py-2 text-right">Qty</th><th className="font-normal px-3 py-2 text-right">Price</th><th className="font-normal px-4 py-2 text-right">Fee</th></tr></thead>
                <tbody>{t.executions.map((x, i) => <tr key={i} className="border-b border-card-border/60 last:border-0"><td className="px-4 py-2 uppercase">{x.kind}</td><td className="px-3 py-2">{dt(x.timestamp)}</td><td className="px-3 py-2 text-right">{x.quantity}</td><td className="px-3 py-2 text-right">{x.price}</td><td className="px-4 py-2 text-right">{x.fee ?? "—"}</td></tr>)}</tbody>
              </table>
            </Panel>
          )}
        </div>
        <div className="space-y-4">
          <Panel title="Execution">
            <KV k="Entry" v={t.entryPrice} /><KV k="Exit" v={t.exitPrice} /><KV k="Stop" v={t.stopLoss} /><KV k="Target" v={t.takeProfit} />
            <KV k="Quantity" v={t.quantity} /><KV k="Multiplier" v={t.multiplier} /><KV k="Asset class" v={t.assetClass} />
          </Panel>
          <Panel title="P&L breakdown">
            <KV k="Source" v={t.pnlSource === "calculated" ? "Calculated (linear)" : "Broker"} />
            <KV k="Gross" v={money(t.grossPnl, t.currency)} /><KV k="Commission" v={money(t.commission ?? 0, t.currency)} /><KV k="Funding" v={money(t.funding ?? 0, t.currency)} /><KV k="Slippage" v={money(t.slippage ?? 0, t.currency)} />
            <KV k="Net" v={<Money v={t.netPnl} currency={t.currency} />} />
          </Panel>
          <Panel title="Context and behavior">
            <KV k="Timeframe" v={[t.timeframe, t.higherTimeframe].filter(Boolean).join(" / ") || null} /><KV k="Session" v={t.session || null} /><KV k="Regime" v={t.regime || null} />
            <KV k="Emotion" v={t.emotion || null} /><KV k="Confidence" v={t.confidence ? `${t.confidence}/5` : null} /><KV k="Grade" v={t.grade} />
            <KV k="Followed plan" v={t.followedPlan === undefined ? null : t.followedPlan ? "Yes" : "No"} />
            {t.behavioralTags && t.behavioralTags.length > 0 && <div className="flex flex-wrap gap-1 pt-3">{t.behavioralTags.map((b) => <span key={b} className="rounded-sm bg-secondary px-1.5 py-0.5 text-[11px]">{b}</span>)}</div>}
          </Panel>
          <p className="text-[11px] text-muted-foreground num px-1">Created {dt(t.createdAt)} · updated {dt(t.updatedAt)}</p>
        </div>
      </div>
    </div>
  );
}
