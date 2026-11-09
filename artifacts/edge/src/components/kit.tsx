import { type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, Lock, RotateCw } from "lucide-react";
import type { GroupMetrics } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { errMsg, money, pf, ratio, rFmt, tone } from "@/lib/format";
import { useMode } from "@/lib/mode";

export const MIN_SAMPLE = 20;

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-5 rise">
      <div className="min-w-0">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="text-[26px] leading-tight font-medium tracking-[-0.02em]" data-testid="text-page-title">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, meta, children, className, bodyClass, actions }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; actions?: ReactNode }) {
  return (
    <section className={cn("panel rise min-w-0", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 h-11 border-b border-card-border">
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="text-[13px] font-medium truncate">{title}</h2>
            {meta && <span className="text-[11px] text-muted-foreground truncate">{meta}</span>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, valueClass, testId, hint }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string; testId?: string; hint?: string }) {
  const body = (
    <div className="px-4 py-3.5 min-w-0">
      <div className="eyebrow truncate">{label}</div>
      <div className={cn("num text-[22px] mt-1.5 leading-none tracking-tight truncate", valueClass)} data-testid={testId}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-2 truncate">{sub}</div>}
    </div>
  );
  if (!hint) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild><div className="cursor-help">{body}</div></TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("panel rise grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 divide-x divide-y xl:divide-y-0 divide-card-border overflow-hidden", className)}>{children}</div>;
}

export function SampleBadge({ n, min = MIN_SAMPLE }: { n: number; min?: number }) {
  if (n >= min) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-sm border border-[hsl(var(--caution)/.3)] px-1.5 py-px text-[10px] font-mono uppercase tracking-wider text-caution">
          n&lt;{min}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">Only {n} closed trade{n === 1 ? "" : "s"}. Observed results at this sample size are highly sensitive to single outcomes.</TooltipContent>
    </Tooltip>
  );
}

export function Caution({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-[hsl(var(--caution)/.22)] bg-[hsl(var(--caution)/.05)] px-3 py-2.5 text-[12.5px] text-[hsl(38_30%_78%)]">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-caution" />
      <div>{children}</div>
    </div>
  );
}

export function LoadingBlock({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} data-testid="status-loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full bg-muted/70" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

export function ErrorBlock({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="panel p-6 flex flex-col items-start gap-3" data-testid="status-error">
      <div className="eyebrow text-neg">Request failed</div>
      <p className="text-sm text-muted-foreground">{errMsg(error)}</p>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry} data-testid="button-retry">
          <RotateCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, body, action, icon }: { title: string; body: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6 grid-bg rounded-md" data-testid="status-empty">
      <div className="h-10 w-10 rounded-md border border-border bg-card flex items-center justify-center text-muted-foreground mb-4">
        {icon ?? <span className="num text-xs">0</span>}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <p className="text-[13px] text-muted-foreground mt-1.5 max-w-sm">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Money({ v, currency, signed = true, className }: { v: string | number | null | undefined; currency: string; signed?: boolean; className?: string }) {
  return <span className={cn("num", tone(v), className)}>{money(v, currency, { signed })}</span>;
}

export function R({ v, className }: { v: string | number | null | undefined; className?: string }) {
  return <span className={cn("num", tone(v), className)}>{rFmt(v)}</span>;
}

/** Shows write action when permitted, otherwise a sign-in / switch prompt. */
export function WriteGate({ children, compact }: { children?: ReactNode; compact?: boolean }) {
  const { canWrite, signedIn, setDemo } = useMode();
  if (canWrite) return <>{children ?? null}</>;
  if (signedIn) {
    return (
      <Button size="sm" variant="outline" onClick={() => setDemo(false)} data-testid="button-switch-own">
        <Lock className="h-3.5 w-3.5 mr-1.5" /> {compact ? "Read-only" : "Read-only demo · switch to your workspace"}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" asChild>
      <Link href="/sign-in" data-testid="link-signin-to-edit">
        <Lock className="h-3.5 w-3.5 mr-1.5" /> {compact ? "Sign in to edit" : "Read-only demo · sign in to edit"}
      </Link>
    </Button>
  );
}

export function GroupTable({ rows, currency, label = "Group", empty, onRowClick, minSample = MIN_SAMPLE, showColor }: {
  rows: GroupMetrics[]; currency: string; label?: string; empty?: ReactNode; onRowClick?: (g: GroupMetrics) => void; minSample?: number; showColor?: boolean;
}) {
  if (!rows.length) return <>{empty ?? <div className="text-sm text-muted-foreground py-6 text-center">No closed trades in scope.</div>}</>;
  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-card-border">
            <th className="font-normal px-4 py-2">{label}</th>
            <th className="font-normal px-3 py-2 text-right">Trades</th>
            <th className="font-normal px-3 py-2 text-right">Win rate</th>
            <th className="font-normal px-3 py-2 text-right">Net P&amp;L</th>
            <th className="font-normal px-3 py-2 text-right">Avg R</th>
            <th className="font-normal px-3 py-2 text-right">Total R</th>
            <th className="font-normal px-4 py-2 text-right">PF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const low = g.sampleWarning ?? g.totalTrades < minSample;
            return (
              <tr key={g.id} onClick={onRowClick ? () => onRowClick(g) : undefined} className={cn("border-b border-card-border/60 last:border-0 row-hover", onRowClick && "cursor-pointer")} data-testid={`row-group-${g.id}`}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {showColor && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: g.color ?? "hsl(var(--muted-foreground))" }} />}
                    <span className="truncate max-w-[260px]">{g.name}</span>
                    {low && <SampleBadge n={g.totalTrades} min={minSample} />}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right num">{g.totalTrades}</td>
                <td className={cn("px-3 py-2.5 text-right num", low && "text-muted-foreground")}>{ratio(g.winRate)}</td>
                <td className="px-3 py-2.5 text-right"><Money v={g.netPnl} currency={currency} /></td>
                <td className="px-3 py-2.5 text-right"><R v={g.averageR} /></td>
                <td className="px-3 py-2.5 text-right"><R v={g.totalR} /></td>
                <td className="px-4 py-2.5 text-right num">{pf(g)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const cls = status === "closed" ? "text-foreground/80 border-border" : status === "open" ? "text-signal border-[hsl(var(--signal)/.35)]" : "text-muted-foreground border-dashed border-border";
  return <span className={cn("inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-mono uppercase tracking-wider", cls)}>{status}</span>;
}

export function DirPill({ d }: { d?: string }) {
  if (!d) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("num text-[11px] uppercase tracking-wider", d === "long" ? "text-pos" : "text-neg")}>{d === "long" ? "Long" : "Short"}</span>;
}
