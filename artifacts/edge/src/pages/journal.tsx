import { useDeferredValue, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Download, Plus, Search } from "lucide-react";
import { useListTrades, type Trade } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NSelect } from "@/components/nselect";
import { FilterBar } from "@/components/filter-bar";
import { DirPill, Empty, ErrorBlock, LoadingBlock, Money, PageHeader, Panel, R, StatusPill, WriteGate } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { useDateFormatter } from "@/lib/time";

function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(trades: Trade[], scope: string) {
  const cols: [string, (t: Trade) => unknown][] = [
    ["id", (t) => t.id], ["status", (t) => t.status], ["account", (t) => t.accountName], ["currency", (t) => t.currency], ["symbol", (t) => t.symbol], ["assetClass", (t) => t.assetClass],
    ["direction", (t) => t.direction], ["strategy", (t) => t.strategyName], ["entryAtUtc", (t) => t.entryAt], ["exitAtUtc", (t) => t.exitAt], ["entryPrice", (t) => t.entryPrice], ["exitPrice", (t) => t.exitPrice],
    ["stopLoss", (t) => t.stopLoss], ["takeProfit", (t) => t.takeProfit], ["quantity", (t) => t.quantity], ["initialRisk", (t) => t.initialRisk], ["grossPnl", (t) => t.grossPnl], ["commission", (t) => t.commission],
    ["funding", (t) => t.funding], ["slippage", (t) => t.slippage], ["netPnl", (t) => t.netPnl], ["realizedR", (t) => t.realizedR], ["confluences", (t) => t.confluences.map((c) => c.name)],
    ["session", (t) => t.session], ["emotion", (t) => t.emotion], ["grade", (t) => t.grade], ["followedPlan", (t) => t.followedPlan], ["behavioralTags", (t) => t.behavioralTags], ["lesson", (t) => t.lesson], ["chartUrl", (t) => t.chartUrl],
  ];
  const lines = [`# EDGE export · ${scope} · ${trades.length} trades · generated ${new Date().toISOString()}`, cols.map((c) => c[0]).join(","), ...trades.map((t) => cols.map(([, f]) => cell(f(t))).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `edge-trades-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function Journal() {
  const dt = useDateFormatter();
  const { demo } = useMode();
  const { tradeParams, scopeLabel } = useFilters();
  const [, nav] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const ds = useDeferredValue(search.trim());
  const params = useMemo(() => ({ ...tradeParams, ...(status ? { status } : {}), ...(ds ? { search: ds } : {}) }), [tradeParams, status, ds]);
  const q = useListTrades(params);
  const trades = q.data ?? [];

  const totals = useMemo(() => {
    const closed = trades.filter((t) => t.status === "closed");
    return { closed: closed.length, net: closed.reduce((s, t) => s + (Number(t.netPnl) || 0), 0), cur: trades[0]?.currency ?? "USD" };
  }, [trades]);

  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Journal" : "Journal"} title="Every trade, on the record"
        sub="Search across symbols and written review. Drafts and open trades are listed but excluded from analytics."
        actions={<>
          <Button size="sm" variant="outline" disabled={!trades.length} onClick={() => exportCsv(trades, `${scopeLabel}${status ? ` · ${status}` : ""}${ds ? ` · search "${ds}"` : ""}${demo ? " · DEMO DATA" : ""}`)} data-testid="button-export-csv">
            <Download className="h-3.5 w-3.5 mr-1.5" />Export {trades.length ? `${trades.length} rows` : "CSV"}
          </Button>
          <WriteGate><Button size="sm" asChild><Link href="/trades/new" data-testid="link-journal-new"><Plus className="h-3.5 w-3.5 mr-1.5" />Log trade</Link></Button></WriteGate>
        </>}
      />
      <FilterBar />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search thesis, lessons, symbols..." className="h-8 w-[280px] pl-8 text-[12.5px] bg-card" data-testid="input-search" />
        </div>
        <NSelect value={status} onChange={setStatus} allowNone noneLabel="All statuses" className="w-[140px]" testId="select-status" options={[{ value: "closed", label: "Closed" }, { value: "open", label: "Open" }, { value: "draft", label: "Draft" }]} />
        <span className="ml-auto text-[12px] text-muted-foreground num">{trades.length} shown · {totals.closed} closed · <Money v={totals.net} currency={totals.cur} /></span>
      </div>
      <Panel bodyClass="p-0">
        {q.isLoading ? <div className="p-4"><LoadingBlock rows={8} /></div> : q.error ? <div className="p-4"><ErrorBlock error={q.error} retry={() => q.refetch()} /></div> : trades.length === 0 ? (
          <Empty title={ds || status ? "Nothing matches" : "The journal is empty"} body={ds || status ? "Try a broader search or clear the status filter." : "Logged trades appear here, newest first."}
            action={!(ds || status) ? <WriteGate><Button size="sm" asChild><Link href="/trades/new">Log a trade</Link></Button></WriteGate> : <Button size="sm" variant="outline" onClick={() => { setSearch(""); setStatus(""); }}>Clear</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-card-border">
                  {["Date", "Symbol", "Side", "Status", "Strategy", "Confluences", "Grade", "Net P&L", "R"].map((h, i) => (
                    <th key={h} className={`font-normal px-3 py-2.5 whitespace-nowrap ${i === 0 ? "pl-4" : ""} ${i >= 7 ? "text-right" : ""} ${i === 8 ? "pr-4" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} onClick={() => nav(`/trades/${t.id}`)} className="border-b border-card-border/60 last:border-0 row-hover cursor-pointer" data-testid={`row-trade-${t.id}`}>
                    <td className="pl-4 px-3 py-2.5 num text-muted-foreground whitespace-nowrap">{dt(t.exitAt ?? t.entryAt ?? t.createdAt, "dd MMM yy")}</td>
                    <td className="px-3 py-2.5 font-medium">{t.symbol || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5"><DirPill d={t.direction} /></td>
                    <td className="px-3 py-2.5"><StatusPill status={t.status} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[160px]">{t.strategyName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">{t.confluences.slice(0, 6).map((c) => <span key={c.id} title={c.name} className="h-2 w-2 rounded-full" style={{ background: c.color ?? "#888" }} />)}<span className="num text-[11px] text-muted-foreground ml-1">{t.confluences.length || ""}</span></div>
                    </td>
                    <td className="px-3 py-2.5 num">{t.grade ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{t.status === "closed" ? <Money v={t.netPnl} currency={t.currency} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="pr-4 px-3 py-2.5 text-right"><R v={t.realizedR} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-[11px] text-muted-foreground mt-3">CSV export contains exactly the rows shown above (current filters and search), with spreadsheet formula characters escaped.</p>
    </div>
  );
}
