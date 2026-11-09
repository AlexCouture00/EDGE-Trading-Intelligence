import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EquityPoint, GroupMetrics } from "@workspace/api-client-react";
import { formatInTimeZone } from "date-fns-tz";
import { useTimezone } from "@/lib/time";
import { money, num } from "@/lib/format";

const axis = { stroke: "hsl(220 5% 40%)", fontSize: 10.5, fontFamily: "Geist Mono, monospace", tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="hsl(220 6% 100% / 0.04)" vertical={false} />;

function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: { value: number; name: string; color?: string }[]; label?: string | number; fmt: (v: number, name: string) => string }) {
  const timezone = useTimezone();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-popover-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="text-muted-foreground mb-1 num">{typeof label === "string" && label.length >= 10 ? safeDate(label, timezone) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="num flex gap-3 justify-between"><span className="text-muted-foreground">{p.name}</span><span>{fmt(p.value, p.name)}</span></div>
      ))}
    </div>
  );
}

function safeDate(s: string, timezone: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : formatInTimeZone(d, timezone, "dd MMM yyyy");
}
function tick(s: string, timezone: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : formatInTimeZone(d, timezone, "MMM yy");
}

export function EquityChart({ data, currency, height = 260 }: { data: EquityPoint[]; currency: string; height?: number }) {
  const timezone = useTimezone();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(40 12% 94%)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="hsl(40 12% 94%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={(s: string) => tick(s, timezone)} minTickGap={40} />
        <YAxis {...axis} width={64} domain={["auto", "auto"]} tickFormatter={(v: number) => money(v, currency, { compact: true })} />
        <Tooltip content={<Tip fmt={(v) => money(v, currency)} />} cursor={{ stroke: "hsl(220 5% 30%)" }} />
        <Area type="monotone" dataKey="balance" name="Realized balance" stroke="hsl(40 12% 90%)" strokeWidth={1.5} fill="url(#eq)" dot={false} isAnimationActive />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RChart({ data, height = 220 }: { data: EquityPoint[]; height?: number }) {
  const timezone = useTimezone();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={(s: string) => tick(s, timezone)} minTickGap={40} />
        <YAxis {...axis} width={44} tickFormatter={(v: number) => `${v}R`} />
        <ReferenceLine y={0} stroke="hsl(220 5% 28%)" />
        <Tooltip content={<Tip fmt={(v) => `${v.toFixed(2)}R`} />} cursor={{ stroke: "hsl(220 5% 30%)" }} />
        <Line type="monotone" dataKey="cumulativeR" name="Cumulative R" stroke="hsl(var(--signal))" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ data, currency, height = 200 }: { data: EquityPoint[]; currency: string; height?: number }) {
  const timezone = useTimezone();
  const d = data.map((p) => ({ ...p, dd: -Math.abs(p.drawdown) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={d} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={(s: string) => tick(s, timezone)} minTickGap={40} />
        <YAxis {...axis} width={64} tickFormatter={(v: number) => money(v, currency, { compact: true })} />
        <Tooltip content={<Tip fmt={(v) => money(v, currency)} />} cursor={{ stroke: "hsl(220 5% 30%)" }} />
        <Area type="stepAfter" dataKey="dd" name="Drawdown" stroke="hsl(var(--neg))" strokeWidth={1.25} fill="hsl(var(--neg) / 0.12)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GroupBars({ rows, metric, currency, height = 220 }: { rows: GroupMetrics[]; metric: "netPnl" | "totalR"; currency: string; height?: number }) {
  const data = rows.map((r) => ({ name: r.name, v: metric === "netPnl" ? num(r.netPnl) ?? 0 : r.totalR }));
  const fmt = (v: number) => (metric === "netPnl" ? money(v, currency, { signed: true }) : `${v.toFixed(2)}R`);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="name" {...axis} minTickGap={8} />
        <YAxis {...axis} width={64} tickFormatter={(v: number) => (metric === "netPnl" ? money(v, currency, { compact: true }) : `${v}R`)} />
        <ReferenceLine y={0} stroke="hsl(220 5% 28%)" />
        <Tooltip content={<Tip fmt={(v) => fmt(v)} />} cursor={{ fill: "hsl(220 6% 100% / 0.03)" }} />
        <Bar dataKey="v" name={metric === "netPnl" ? "Net P&L" : "Total R"} radius={[2, 2, 0, 0]} maxBarSize={34}>
          {data.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "hsl(var(--pos) / 0.75)" : "hsl(var(--neg) / 0.75)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Histogram({ data, height = 200 }: { data: { bucket: string; count: number; positive: boolean }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="bucket" {...axis} />
        <YAxis {...axis} width={30} allowDecimals={false} />
        <Tooltip content={<Tip fmt={(v) => `${v} trades`} />} cursor={{ fill: "hsl(220 6% 100% / 0.03)" }} />
        <Bar dataKey="count" name="Trades" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.positive ? "hsl(var(--pos) / 0.7)" : "hsl(var(--neg) / 0.7)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
