import { useMemo, useState } from "react";
import { Link } from "wouter";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useListTrades, type Trade } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filter-bar";
import { DirPill, ErrorBlock, LoadingBlock, Money, PageHeader, Panel, R } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDateFormatter, useTimezone } from "@/lib/time";

export default function CalendarPage() {
  const dt = useDateFormatter();
  const timezone = useTimezone();
  const { demo } = useMode();
  const { tradeParams, currency } = useFilters();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [by, setBy] = useState<"exit" | "entry">("exit");
  const [day, setDay] = useState<string | null>(null);
  const { from: _from, ...rest } = tradeParams;
  void _from;
  const q = useListTrades({ ...rest, status: "closed" });

  const byDay = useMemo(() => {
    const m = new Map<string, Trade[]>();
    (q.data ?? []).forEach((t) => {
      const iso = by === "exit" ? t.exitAt : t.entryAt;
      if (!iso) return;
      const k = dt(iso, "yyyy-MM-dd");
      m.set(k, [...(m.get(k) ?? []), t]);
    });
    return m;
  }, [q.data, by, timezone]);

  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const monthTrades = days.filter((d) => isSameMonth(d, month)).flatMap((d) => byDay.get(format(d, "yyyy-MM-dd")) ?? []);
  const monthNet = monthTrades.reduce((s, t) => s + (num(t.netPnl) ?? 0), 0);
  const dayTrades = day ? byDay.get(day) ?? [] : [];

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Calendar" : "Calendar"} title="Closed trades by day" sub={`Days use ${timezone}. Choose whether a trade lands on its entry or exit date.`} />
      <FilterBar hideRange />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonth((m) => subMonths(m, 1))} data-testid="button-prev-month"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="w-36 text-center text-[15px] font-medium" data-testid="text-month">{format(month, "MMMM yyyy")}</div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonth((m) => addMonths(m, 1))} data-testid="button-next-month"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setMonth(startOfMonth(new Date()))} data-testid="button-today">Today</Button>
        </div>
        <div className="grid grid-cols-2 rounded-md border border-border p-0.5 text-[12px]" data-testid="toggle-date-basis">
          {(["exit", "entry"] as const).map((b) => <button key={b} onClick={() => setBy(b)} className={cn("h-7 px-3 rounded-[4px] transition-colors", by === b ? "bg-secondary" : "text-muted-foreground hover:text-foreground")} data-testid={`button-basis-${b}`}>By {b} date</button>)}
        </div>
        <span className="ml-auto text-[12.5px] num text-muted-foreground">{monthTrades.length} trades · <Money v={monthNet} currency={currency} /></span>
      </div>
      {q.isLoading ? <LoadingBlock rows={8} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="panel overflow-hidden rise">
            <div className="grid grid-cols-7 border-b border-card-border">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="eyebrow px-2 py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const k = format(d, "yyyy-MM-dd");
                const ts = byDay.get(k) ?? [];
                const net = ts.reduce((s, t) => s + (num(t.netPnl) ?? 0), 0);
                const inMonth = isSameMonth(d, month);
                return (
                  <button key={k} onClick={() => setDay(ts.length ? k : null)} className={cn("min-h-[84px] border-r border-b border-card-border/70 p-2 text-left transition-colors flex flex-col", !inMonth && "opacity-30", ts.length && "hover:bg-secondary/40", day === k && "bg-secondary/60")} data-testid={`button-day-${k}`}>
                    <span className={cn("num text-[11px]", isToday(d) ? "text-foreground font-semibold" : "text-muted-foreground")}>{format(d, "d")}</span>
                    {ts.length > 0 && (
                      <span className="mt-auto">
                        <span className={cn("block num text-[12px]", net > 0 ? "text-pos" : net < 0 ? "text-neg" : "text-muted-foreground")}>{money(net, currency, { signed: true, compact: true })}</span>
                        <span className="block text-[10px] text-muted-foreground">{ts.length} trade{ts.length > 1 ? "s" : ""}</span>
                      </span>
                    )}
                    {ts.length > 0 && <span className="h-px w-full mt-1.5" style={{ background: net >= 0 ? "hsl(var(--pos) / .5)" : "hsl(var(--neg) / .5)" }} />}
                  </button>
                );
              })}
            </div>
          </div>
          <Panel title={day ? format(new Date(day + "T00:00:00"), "EEEE, d MMMM") : "Day detail"} meta={day ? `By ${by} date` : undefined} bodyClass="p-0">
            {!day ? <div className="p-6 text-sm text-muted-foreground">Select a day with trades to see them here.</div> : dayTrades.map((t) => (
              <Link key={t.id} href={`/trades/${t.id}`} className="block px-4 py-3 border-b border-card-border/60 last:border-0 row-hover" data-testid={`link-day-trade-${t.id}`}>
                <div className="flex items-center justify-between"><span className="font-medium text-[13px]">{t.symbol} <DirPill d={t.direction} /></span><Money v={t.netPnl} currency={t.currency} className="text-[13px]" /></div>
                <div className="flex items-center justify-between text-[11.5px] text-muted-foreground mt-1"><span>{t.strategyName ?? "No strategy"}</span><R v={t.realizedR} /></div>
              </Link>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
