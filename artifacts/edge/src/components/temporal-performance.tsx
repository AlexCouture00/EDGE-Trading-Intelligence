import { useMemo, useState } from "react";
import type { DaySessionMetrics, GroupMetrics, TemporalAnalytics } from "@workspace/api-client-react";
import { Caution, GroupTable, MIN_SAMPLE, Panel } from "@/components/kit";
import { cn } from "@/lib/utils";
import { pf, ratio, rFmt } from "@/lib/format";

type Metric = "avg" | "total";
const DAY_FALLBACK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function cellValue(c: GroupMetrics, m: Metric): number | null {
  if (!c.rSample) return null;
  return m === "avg" ? c.averageR ?? null : c.totalR;
}

function cellBg(v: number | null, max: number): string | undefined {
  if (v === null) return undefined;
  if (v === 0) return "hsl(var(--muted-foreground) / .12)";
  if (max <= 0) return undefined;
  const t = Math.min(1, Math.abs(v) / max);
  const a = (0.1 + t * 0.62).toFixed(3);
  return v > 0 ? `hsl(var(--pos) / ${a})` : `hsl(var(--neg) / ${a})`;
}

function describe(c: DaySessionMetrics, day: string): string {
  if (!c.totalTrades) return `${day}, ${c.session}: no closed trades`;
  return `${day}, ${c.session}: ${c.totalTrades} trade${c.totalTrades === 1 ? "" : "s"}, ${c.rSample} with R, win rate ${ratio(c.winRate)}, average ${rFmt(c.averageR)}, total ${rFmt(c.rSample ? c.totalR : null)}, profit factor ${pf(c)}${c.rSample < MIN_SAMPLE ? ", small R sample" : ""}`;
}

function Heatmap({ cells, days }: { cells: DaySessionMetrics[]; days: Map<string, string> }) {
  const [metric, setMetric] = useState<Metric>("avg");
  const [active, setActive] = useState<string | null>(null);

  const sessions = useMemo(() => Array.from(new Set(cells.map((c) => c.session))), [cells]);
  const dayIds = useMemo(() => Array.from(new Set(cells.map((c) => c.dayId))).sort((a, b) => Number(a) - Number(b)), [cells]);
  const lookup = useMemo(() => new Map(cells.map((c) => [`${c.dayId}|${c.session}`, c])), [cells]);
  const max = useMemo(() => cells.reduce((m, c) => { const v = cellValue(c, metric); return v === null ? m : Math.max(m, Math.abs(v)); }, 0), [cells, metric]);
  const dayName = (id: string) => days.get(id) ?? DAY_FALLBACK[Number(id) - 1] ?? `Day ${id}`;
  const sel = active ? lookup.get(active) : undefined;

  if (!sessions.length || cells.every((c) => !c.totalTrades)) {
    return <div className="text-sm text-muted-foreground py-6 text-center" data-testid="status-heatmap-empty">No closed trades with a valid entry time in scope.</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div role="radiogroup" aria-label="Heatmap metric" className="inline-flex rounded-md border border-border p-0.5">
          {(["avg", "total"] as Metric[]).map((m) => (
            <button key={m} role="radio" aria-checked={metric === m} onClick={() => setMetric(m)} data-testid={`button-heatmap-${m}`}
              className={cn("px-2.5 py-1 text-[11.5px] rounded-sm transition-colors", metric === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {m === "avg" ? "Avg R" : "Total R"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10.5px] num text-muted-foreground" aria-label={`Color scale from ${rFmt(-max)} to ${rFmt(max)}, centered on 0R`}>
          <span>{rFmt(-max)}</span>
          <span className="h-2 w-32 rounded-sm" style={{ background: "linear-gradient(90deg, hsl(var(--neg) / .72), hsl(var(--neg) / .1), hsl(var(--muted-foreground) / .12), hsl(var(--pos) / .1), hsl(var(--pos) / .72))" }} />
          <span>{rFmt(max)}</span>
          <span className="ml-1 inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-border" /> no trades</span>
        </div>
      </div>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="border-separate border-spacing-1 text-[11.5px]" style={{ minWidth: 120 + sessions.length * 92 }}>
          <caption className="sr-only">Day of week by recorded session, colored by {metric === "avg" ? "average R" : "total R"}</caption>
          <thead>
            <tr>
              <th className="w-24" />
              {sessions.map((s) => <th key={s} scope="col" className="font-normal text-muted-foreground text-left px-1 pb-1 truncate max-w-[120px]" title={s}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {dayIds.map((d) => (
              <tr key={d}>
                <th scope="row" className="font-normal text-muted-foreground text-left pr-2 whitespace-nowrap">{dayName(d).slice(0, 3)}</th>
                {sessions.map((s) => {
                  const key = `${d}|${s}`;
                  const c = lookup.get(key);
                  if (!c || !c.totalTrades) {
                    return <td key={s}><div className="h-12 min-w-[84px] rounded-sm border border-dashed border-border/70 flex items-center justify-center text-muted-foreground/60" aria-label={`${dayName(d)}, ${s}: no closed trades`}>—</div></td>;
                  }
                  const v = cellValue(c, metric);
                  const low = c.rSample < MIN_SAMPLE;
                  return (
                    <td key={s}>
                      <button type="button" aria-label={describe(c, dayName(d))} aria-pressed={active === key} data-testid={`cell-heatmap-${d}-${s}`}
                        onMouseEnter={() => setActive(key)} onFocus={() => setActive(key)} onClick={() => setActive(key)}
                        className={cn("h-12 w-full min-w-[84px] rounded-sm flex flex-col items-center justify-center gap-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", active === key && "ring-1 ring-foreground/50", low && "opacity-80")}
                        style={{ background: cellBg(v, max) ?? "hsl(var(--muted) / .6)" }}>
                        <span className="num text-[12px] text-foreground">{rFmt(v)}</span>
                        <span className={cn("num text-[10px]", low ? "text-caution" : "text-foreground/60")}>n={c.totalTrades}{c.rSample !== c.totalTrades ? ` · R=${c.rSample}` : ""}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 rounded-md border border-card-border bg-background/40 px-3 py-2.5 min-h-[52px] text-[12px]" aria-live="polite" data-testid="text-heatmap-detail">
        {sel ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 items-baseline">
            <span className="font-medium">{dayName(sel.dayId)} · {sel.session}</span>
            <span className="num">n {sel.totalTrades}{sel.rSample !== sel.totalTrades ? ` (${sel.rSample} with R)` : ""}</span>
            <span className="num">Win {ratio(sel.winRate)}</span>
            <span className="num">Avg {rFmt(sel.averageR)}</span>
            <span className="num">Total {rFmt(sel.rSample ? sel.totalR : null)}</span>
            <span className="num">PF {pf(sel)}</span>
            {sel.rSample < MIN_SAMPLE && <span className="text-caution text-[11px]">Small R sample: {sel.rSample}&lt;{MIN_SAMPLE}</span>}
          </div>
        ) : <span className="text-muted-foreground">Hover, tap or tab to a cell for full details. Dashed cells have no trades; a measured 0R is shaded neutral grey.</span>}
      </div>
    </div>
  );
}

export function TemporalPerformance({ temporal, bySession, currency }: { temporal: TemporalAnalytics; bySession: GroupMetrics[]; currency: string }) {
  const days = useMemo(() => new Map(temporal.byDayOfWeek.map((g) => [g.id, g.name])), [temporal.byDayOfWeek]);
  const hours = useMemo(() => temporal.byHourOfDay.filter((h) => h.totalTrades > 0), [temporal.byHourOfDay]);
  const tz = temporal.timezone;
  const excluded = temporal.excludedMissingEntry;

  return (
    <div className="space-y-4" data-testid="section-temporal">
      <p className="text-xs text-muted-foreground">
        Day and hour come from each trade's entry timestamp in <span className="num text-foreground/80" data-testid="text-temporal-timezone">{tz}</span>. Sessions are the labels you recorded on the trade, not inferred from the clock. Closed trades within current filters; date-range filters still use exit time. Cells with fewer than {MIN_SAMPLE} recorded R results are flagged.
      </p>
      {excluded > 0 && <Caution><span data-testid="text-excluded-missing-entry">{excluded} closed trade{excluded === 1 ? "" : "s"} without a valid entry time {excluded === 1 ? "is" : "are"} excluded from day, hour and heatmap views (still included in session totals).</span></Caution>}
      <Panel title="Day × session" meta={`Entry day (${tz}) by recorded session · R`}>
        <Heatmap cells={temporal.byDaySession} days={days} />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="By day of week" meta={`Entry day · ${tz}`}>
          <GroupTable rows={temporal.byDayOfWeek} currency={currency} label="Day" />
        </Panel>
        <Panel title="By hour of day" meta={`Entry hour · ${tz} · hours with trades`}>
          <GroupTable rows={hours} currency={currency} label="Hour" empty={<div className="text-sm text-muted-foreground py-6 text-center">No closed trades with a valid entry time in scope.</div>} />
        </Panel>
      </div>
      <Panel title="By session" meta="Recorded trade session · closed trades · current filters">
        <GroupTable rows={bySession} currency={currency} label="Session" />
        <p className="mt-3 text-xs text-muted-foreground">Compare trade count, win rate and R by session. Small samples are flagged; results become more meaningful as you log more trades.</p>
      </Panel>
    </div>
  );
}
