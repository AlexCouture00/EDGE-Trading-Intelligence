import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { useListAccounts } from "@workspace/api-client-react";
import { portfolioReport, sumMoney, type Portfolio } from "@workspace/prop-math";
import { Caution, Panel, Stat, StatStrip } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { ACCOUNT_STATUS, ChartEmpty, MARKETS, Sel, axisTick, tipStyle } from "./shared";

const ALL = "__all";
const C = { cyan: "#61A9BD", red: "#D8524F", green: "#44986D", grey: "#979797", blue: "#1F74AD", orange: "#E98E2E" };

export function Overview({ p }: { p: Portfolio }) {
  const currencies = useMemo(() => [...new Set(["USD", ...p.accounts.map((a) => a.currency), ...p.expenses.map((e) => e.currency)])].sort(), [p]);
  const [currency, setCurrency] = useState("USD");
  const [firmId, setFirmId] = useState(ALL);
  const [market, setMarket] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const r = useMemo(() => portfolioReport(p, {
    currency, firmId: firmId === ALL ? undefined : firmId, marketType: market === ALL ? undefined : market,
    status: status === ALL ? undefined : status, from: from || undefined, to: to || undefined,
  }), [p, currency, firmId, market, status, from, to]);
  const journal = useListAccounts();
  const personal = (journal.data ?? []).filter((a) => a.type === "personal_live" && !a.archived && a.currency === currency);
  const personalTotal = sumMoney(personal.map((a) => a.balance));
  const m = (v: string | null, signed = false) => money(v, currency, { signed });
  const filtered = firmId !== ALL || market !== ALL || status !== ALL || from || to;

  const allocation = r.allocationByFirm.filter((x) => Number(x.value) > 0).map((x) => ({ name: x.name, value: Number(x.value) }));
  const split = [{ name: "Funded", value: Number(r.fundedCapital) }, { name: "Evaluation", value: Number(r.challengeCapital) }];
  const monthly = r.monthly.map((x) => ({ month: x.month, Expenses: Number(x.expenses), Payouts: Number(x.payouts), cumulative: Number(x.cumulative) }));
  const statuses = r.statusDistribution.map((x) => ({ name: ACCOUNT_STATUS[x.name] ?? x.name, value: x.value }));
  const fmtAxis = (v: number) => money(v, currency, { compact: true });

  return (
    <div className="space-y-5">
      <div className="panel rise p-3 grid grid-cols-2 md:grid-cols-[repeat(6,minmax(0,1fr))_auto] gap-2.5 items-end">
        <Sel value={currency} onChange={setCurrency} options={currencies.map((c) => [c, c])} testId="select-filter-currency" />
        <Sel value={firmId} onChange={setFirmId} options={[[ALL, "All firms"], ...p.firms.map((f) => [f.id, f.name] as [string, string])]} testId="select-filter-firm" />
        <Sel value={market} onChange={setMarket} options={[[ALL, "All markets"], ...MARKETS.map((x) => [x, x] as [string, string])]} testId="select-filter-market" />
        <Sel value={status} onChange={setStatus} options={[[ALL, "All statuses"], ...Object.entries(ACCOUNT_STATUS)]} testId="select-filter-status" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 bg-background" aria-label="Cash flows from" data-testid="input-filter-from" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 bg-background" aria-label="Cash flows to" data-testid="input-filter-to" />
        <Button variant="ghost" size="sm" disabled={!filtered} onClick={() => { setFirmId(ALL); setMarket(ALL); setStatus(ALL); setFrom(""); setTo(""); }} data-testid="button-reset-filters">Reset</Button>
        <p className="col-span-full text-[11.5px] text-muted-foreground">Allocations, balances and counts reflect the current state. The date range filters cash flows only (expenses, received and pending payouts). Only {currency} records are included; currencies are never converted.</p>
      </div>

      <StatStrip>
        <Stat label="Nominal allocated capital" value={m(r.nominalAllocatedCapital)} sub={`${r.activeAccounts} active accounts`} testId="text-nominal-capital"
          hint="Sum of nominal sizes of active prop accounts. This is notional buying power granted by firms, not your money, not net worth, and not withdrawable." />
        <Stat label="Funded allocation" value={m(r.fundedCapital)} sub={`${r.fundedAccounts} funded`} testId="text-funded-capital" />
        <Stat label="Evaluation allocation" value={m(r.challengeCapital)} sub={`${r.activeChallenges} active challenges`} testId="text-challenge-capital" />
        <Stat label="Personal live balances" value={journal.isLoading ? "…" : journal.isError ? "Unavailable" : m(personalTotal)} sub={`${personal.length} journal accounts, separate category`} testId="text-personal-balances"
          hint="Balances of your personal live EDGE journal accounts. Your own capital, kept fully separate from prop allocations." />
      </StatStrip>
      <StatStrip>
        <Stat label="Challenge fees paid" value={m(r.challengeFees)} testId="text-challenge-fees" />
        <Stat label="Reset / activation / subscription" value={m(r.otherSetupCosts)} testId="text-setup-costs" />
        <Stat label="Total expenses" value={m(r.expensesTotal)} testId="text-expenses-total" />
        <Stat label="Payouts received" value={m(r.received)} valueClass="text-pos" testId="text-payouts-received" hint="Net amounts of payouts marked paid. Only received cash counts as realized." />
        <Stat label="Pending payouts" value={m(r.pending)} valueClass="text-caution" testId="text-payouts-pending" hint="Requested or approved payouts, at requested amount. Not realized." />
      </StatStrip>
      <StatStrip>
        <Stat label="Net cash profit" value={m(r.netProfit, true)} valueClass={Number(r.netProfit) >= 0 ? "text-pos" : "text-neg"} sub="Payouts received minus expenses, before personal income taxes" testId="text-net-profit" />
        <Stat label="Prop firm ROI" value={r.roi === null ? "Not enough data" : `${Number(r.roi).toFixed(1)}%`} sub="Net cash profit / expenses" testId="text-roi" />
        <Stat label="On-account balance change" value={m(r.onAccountProfit, true)} sub="Latest snapshot vs start; not realized cash" testId="text-on-account" hint="Not withdrawable cash or trade-only P&L. Manual payout deductions, resets and adjustments can affect this estimate. Use the linked journal for trading-only performance." />
        <Stat label="Remaining loss allowance" value={r.remainingDrawdown === null ? "Not enough data" : m(r.remainingDrawdown)}
          sub={`${r.drawdownCoveredAccounts} of ${r.activeAccounts} accounts calculable`} testId="text-remaining-drawdown"
          hint="Only confirmed static balance-loss rules can be computed from snapshots. Shown only when every active account has one." />
      </StatStrip>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Allocated capital by firm" meta={`${currency}, active accounts, current`}>
          {allocation.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, allocation.length * 40)}>
              <BarChart data={allocation} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="hsl(220 6% 14%)" />
                <XAxis type="number" domain={[0, "auto"]} tickFormatter={fmtAxis} tick={axisTick} stroke="hsl(220 6% 18%)" />
                <YAxis type="category" dataKey="name" width={110} tick={axisTick} stroke="hsl(220 6% 18%)" />
                <RTooltip contentStyle={tipStyle} cursor={{ fill: "hsl(220 6% 100% / .03)" }} formatter={(v: number) => [money(v, currency), "Nominal allocation"]} />
                <Bar dataKey="value" fill={C.cyan} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No active accounts with an allocation in {currency}.</ChartEmpty>}
        </Panel>
        <Panel title="Funded vs evaluation" meta={`${currency} nominal, current`}>
          {split.some((x) => x.value > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={split}>
                <CartesianGrid vertical={false} stroke="hsl(220 6% 14%)" />
                <XAxis type="category" dataKey="name" tick={axisTick} stroke="hsl(220 6% 18%)" />
                <YAxis type="number" domain={[0, "auto"]} tickFormatter={fmtAxis} tick={axisTick} stroke="hsl(220 6% 18%)" width={64} />
                <RTooltip contentStyle={tipStyle} cursor={{ fill: "hsl(220 6% 100% / .03)" }} formatter={(v: number) => [money(v, currency), "Nominal allocation"]} />
                <Bar dataKey="value" fill={C.cyan} radius={[3, 3, 0, 0]} maxBarSize={80} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No funded or evaluation accounts in scope.</ChartEmpty>}
        </Panel>
        <Panel title="Monthly expenses and payouts" meta={`${currency}, received cash by month`}>
          {monthly.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthly}>
                <CartesianGrid vertical={false} stroke="hsl(220 6% 14%)" />
                <XAxis type="category" dataKey="month" tick={axisTick} stroke="hsl(220 6% 18%)" />
                <YAxis type="number" domain={[0, "auto"]} tickFormatter={fmtAxis} tick={axisTick} stroke="hsl(220 6% 18%)" width={64} />
                <RTooltip contentStyle={tipStyle} cursor={{ fill: "hsl(220 6% 100% / .03)" }} formatter={(v: number, n: string) => [money(v, currency), n]} />
                <Bar dataKey="Expenses" fill={C.red} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Payouts" fill={C.green} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No expenses or received payouts in this range.</ChartEmpty>}
        </Panel>
        <Panel title="Cumulative net cash profit" meta={`${currency}, month-end level`}>
          {monthly.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthly}>
                <CartesianGrid vertical={false} stroke="hsl(220 6% 14%)" />
                <XAxis type="category" dataKey="month" tick={axisTick} stroke="hsl(220 6% 18%)" />
                <YAxis type="number" tickFormatter={fmtAxis} tick={axisTick} stroke="hsl(220 6% 18%)" width={64} />
                <RTooltip contentStyle={tipStyle} formatter={(v: number) => [money(v, currency, { signed: true }), "Cumulative net"]} />
                <Line type="stepAfter" dataKey="cumulative" stroke={C.cyan} strokeWidth={1.8} dot={monthly.length < 10} />
              </LineChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>Cumulative profit appears once cash flows are recorded.</ChartEmpty>}
        </Panel>
        <Panel title="Account status distribution" meta="count of accounts, current" className="lg:col-span-2">
          {statuses.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statuses}>
                <CartesianGrid vertical={false} stroke="hsl(220 6% 14%)" />
                <XAxis type="category" dataKey="name" tick={axisTick} stroke="hsl(220 6% 18%)" />
                <YAxis type="number" domain={[0, "auto"]} allowDecimals={false} tick={axisTick} stroke="hsl(220 6% 18%)" width={36} />
                <RTooltip contentStyle={tipStyle} cursor={{ fill: "hsl(220 6% 100% / .03)" }} formatter={(v: number) => [v, "Accounts"]} />
                <Bar dataKey="value" fill={C.cyan} radius={[3, 3, 0, 0]} maxBarSize={64} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No accounts match these filters.</ChartEmpty>}
        </Panel>
      </div>
      <Caution>Nominal allocated capital is firm-provided notional capital, not personal assets under management. Account balances are not assumed withdrawable. Net cash profit is before personal income taxes.</Caution>
    </div>
  );
}
