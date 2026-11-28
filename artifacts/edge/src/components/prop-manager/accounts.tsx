import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useListAccounts, type PropAccount, type PropAccountInput, type PropBalance } from "@workspace/api-client-react";
import { accountSnapshot, balanceDate, type Portfolio } from "@workspace/prop-math";
import { Empty, Money, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { dt, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_STATUS, ChartEmpty, ConfirmDelete, EditorDialog, Field, MARKETS, MONEY_RE, MoneyIn, Pill, Sel, TextArea, TextIn, axisTick, nn, statusTone, tipStyle, today, usePropMutations,
} from "./shared";
import { balanceChartPoints, balanceDateLabel, validateBalanceDate } from "./balance-history";

const NONE = "__none";
type BalanceDraft = { recordedOn: string; balance: string; equity: string; note: string };

export function Accounts({ p }: { p: Portfolio }) {
  const { save, remove } = usePropMutations();
  const journal = useListAccounts();
  const [editing, setEditing] = useState<PropAccount | "new" | null>(null);
  const [deleting, setDeleting] = useState<PropAccount | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [balanceFor, setBalanceFor] = useState<string | null>(null);
  const [fixBalance, setFixBalance] = useState<PropBalance | null>(null);
  const firmName = (id: string) => p.firms.find((f) => f.id === id)?.name ?? "Unknown firm";
  const current = selected ? p.accounts.find((a) => a.id === selected) : p.accounts[0];

  const blank: PropAccountInput = {
    firmId: p.firms.find((f) => f.status === "active")?.id ?? "", name: "", reference: "", marketType: "CFD", platform: "", currency: "USD",
    nominalSize: "", startingBalance: "", purchasedOn: today(), status: "not_started", phase: "", journalAccountId: null, notes: "",
  };
  const initial: PropAccountInput = editing && editing !== "new" ? {
    firmId: editing.firmId, name: editing.name, reference: editing.reference, marketType: editing.marketType, platform: editing.platform, currency: editing.currency,
    nominalSize: editing.nominalSize, startingBalance: editing.startingBalance, purchasedOn: editing.purchasedOn, status: editing.status, phase: editing.phase,
    journalAccountId: editing.journalAccountId, notes: editing.notes,
  } : blank;
  const frozen = !!editing && editing !== "new";

  return (
    <div className="space-y-5">
      <Panel title="Prop accounts" meta={`${p.accounts.length} recorded`} bodyClass="p-0"
        actions={<Button size="sm" disabled={!p.firms.length} onClick={() => setEditing("new")} data-testid="button-add-account"><Plus className="h-3.5 w-3.5 mr-1" />Add account</Button>}>
        {!p.accounts.length ? (
          <div className="p-4"><Empty icon={<Wallet className="h-4 w-4" />} title="No prop accounts" body={p.firms.length ? "Add an account to start tracking balances, challenges, rules and cash flows." : "Add a firm first, then its accounts."} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[760px]">
              <thead><tr className="text-left text-muted-foreground border-b border-card-border">
                <th className="font-normal px-4 py-2">Account</th><th className="font-normal px-3 py-2">Status</th>
                <th className="font-normal px-3 py-2 text-right">Size</th><th className="font-normal px-3 py-2 text-right">Balance</th>
                <th className="font-normal px-3 py-2 text-right">Balance change</th><th className="font-normal px-3 py-2">Balance date</th><th className="px-4" />
              </tr></thead>
              <tbody>
                {p.accounts.map((a) => {
                  const s = accountSnapshot(p, a.id);
                  const payoutPending = p.payouts.some((x) => x.accountId === a.id && (x.status === "requested" || x.status === "approved"));
                  return (
                    <tr key={a.id} onClick={() => setSelected(a.id)} className={cn("border-b border-card-border/60 last:border-0 row-hover cursor-pointer", current?.id === a.id && "bg-[hsl(220_6%_100%/.03)]")} data-testid={`row-account-${a.id}`}>
                      <td className="px-4 py-2.5"><div className="font-medium">{a.name}</div><div className="text-[11px] text-muted-foreground">{firmName(a.firmId)} · {a.marketType}{a.phase ? ` · ${a.phase}` : ""}</div></td>
                      <td className="px-3 py-2.5"><div className="flex gap-1 flex-wrap"><Pill tone={statusTone(a.status)}>{ACCOUNT_STATUS[a.status]}</Pill>{payoutPending && <Pill tone="caution">Payout pending</Pill>}</div></td>
                      <td className="px-3 py-2.5 text-right num">{money(a.nominalSize, a.currency)}</td>
                      <td className="px-3 py-2.5 text-right num">{money(s.balance, a.currency)}</td>
                      <td className="px-3 py-2.5 text-right"><Money v={s.onAccountProfit} currency={a.currency} /></td>
                      <td className="px-3 py-2.5 text-muted-foreground num text-[11.5px]">{s.balanceDate ? balanceDateLabel(s.balanceDate) : "No snapshot"}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(a); }} data-testid={`button-edit-account-${a.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={(e) => { e.stopPropagation(); setDeleting(a); }} data-testid={`button-delete-account-${a.id}`}><Trash2 className="h-3.5 w-3.5 text-neg" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {current && <BalancePanel p={p} account={current} onAdd={() => setBalanceFor(current.id)} onFix={setFixBalance} />}

      {deleting && <ConfirmDelete key={deleting.id} open what={deleting.name} confirmationName={deleting.name}
        onClose={() => setDeleting(null)}
        description={`Permanently delete ${deleting.name} (${deleting.reference || deleting.id}) and its linked history: ${p.balances.filter(x => x.accountId === deleting.id).length} balances, ${p.challenges.filter(x => x.accountId === deleting.id).length} challenges, ${p.rules.filter(x => x.accountId === deleting.id).length} rules, ${p.expenses.filter(x => x.accountId === deleting.id).length} expenses and ${p.payouts.filter(x => x.accountId === deleting.id).length} payouts. Financial totals will change. This cannot be undone. Your journal trades, prop firm, other accounts and expenses not linked to this account will remain unchanged.`}
        onConfirm={async () => { await remove("accounts", deleting.id, deleting.name); setSelected(null); }} />}

      {editing && (
        <EditorDialog key={editing === "new" ? "new" : editing.id} open onClose={() => setEditing(null)} initial={initial}
          title={editing === "new" ? "Add prop account" : `Edit ${editing.name}`}
          description={frozen ? "Firm, currency, nominal size and starting balance are fixed once an account exists. Archive via status to keep history, or use Delete to remove the account and its linked prop history." : "Status and phase are tracked separately. Archive to preserve history; deletion permanently removes linked prop history."}
          validate={(d) => !d.firmId ? "Choose a firm." : !d.name.trim() ? "Account name is required." : !/^[A-Z]{3}$/.test(d.currency) ? "Currency must be a 3-letter code, e.g. USD."
            : !MONEY_RE.test(d.nominalSize) || !MONEY_RE.test(d.startingBalance) ? "Enter nominal size and starting balance as plain decimals." : null}
          onSubmit={(d) => save("accounts", editing === "new" ? null : editing.id, { ...d, name: d.name.trim() })}>
          {(d, set) => <>
            <Field label="Prop firm"><Sel value={d.firmId} disabled={frozen} onChange={(v) => set("firmId", v)} options={p.firms.map((f) => [f.id, f.name + (f.status === "archived" ? " (archived)" : "")])} testId="select-account-firm" /></Field>
            <Field label="Account name"><TextIn value={d.name} onChange={(v) => set("name", v)} testId="input-account-name" /></Field>
            <Field label="Account number / reference"><TextIn value={d.reference} onChange={(v) => set("reference", v)} testId="input-account-reference" /></Field>
            <Field label="Market type"><Sel value={d.marketType} onChange={(v) => set("marketType", v as PropAccountInput["marketType"])} options={MARKETS.map((m) => [m, m])} testId="select-account-market" /></Field>
            <Field label="Trading platform"><TextIn value={d.platform} onChange={(v) => set("platform", v)} testId="input-account-platform" /></Field>
            <Field label="Currency"><TextIn value={d.currency} disabled={frozen} onChange={(v) => set("currency", v.toUpperCase().slice(0, 3))} testId="input-account-currency" /></Field>
            <Field label="Nominal account size"><MoneyIn value={d.nominalSize} disabled={frozen} onChange={(v) => set("nominalSize", v)} testId="input-account-size" placeholder="100000" /></Field>
            <Field label="Starting balance"><MoneyIn value={d.startingBalance} disabled={frozen} onChange={(v) => set("startingBalance", v)} testId="input-account-starting" placeholder="100000" /></Field>
            <Field label="Purchase date"><TextIn type="date" value={d.purchasedOn} onChange={(v) => set("purchasedOn", v)} testId="input-account-purchased" /></Field>
            <Field label="Status"><Sel value={d.status} onChange={(v) => set("status", v as PropAccountInput["status"])} options={Object.entries(ACCOUNT_STATUS)} testId="select-account-status" /></Field>
            <Field label="Challenge phase" hint="e.g. Phase 1, Phase 2, Funded"><TextIn value={d.phase} onChange={(v) => set("phase", v)} testId="input-account-phase" /></Field>
            <Field label="Linked journal account (optional)">
              <Sel value={d.journalAccountId ?? NONE} onChange={(v) => set("journalAccountId", v === NONE ? null : v)}
                options={[[NONE, "Not linked"], ...(journal.data ?? []).map((j) => [j.id, `${j.name} (${j.currency})`] as [string, string])]} testId="select-account-journal" />
            </Field>
            <Field label="Notes" className="sm:col-span-2"><TextArea value={d.notes} onChange={(v) => set("notes", v)} testId="input-account-notes" /></Field>
          </>}
        </EditorDialog>
      )}

      {(balanceFor || fixBalance) && (() => {
        const accId = fixBalance?.accountId ?? balanceFor!;
        const acc = p.accounts.find((a) => a.id === accId);
        const init: BalanceDraft = fixBalance
          ? { recordedOn: balanceDate(fixBalance), balance: fixBalance.balance, equity: fixBalance.equity ?? "", note: "" }
          : { recordedOn: today(), balance: "", equity: "", note: "" };
        return (
          <EditorDialog key={fixBalance?.id ?? "new-balance"} open onClose={() => { setBalanceFor(null); setFixBalance(null); }} initial={init}
            title={fixBalance ? "Append correction snapshot" : `Record balance · ${acc?.name ?? ""}`}
            description={fixBalance ? `This appends a correction for ${balanceDateLabel(balanceDate(fixBalance))}; the original entry is kept. The selected balance date determines its place in history.` : "Choose the date the balance was observed, including past dates. History and progress follow this date, not when you add the entry. Payouts do not change balances automatically."}
            validate={(d) => validateBalanceDate(d.recordedOn, today()) ?? (!MONEY_RE.test(d.balance) ? "Balance must be a plain decimal." : d.equity && !MONEY_RE.test(d.equity) ? "Equity must be a plain decimal or empty." : null)}
            onSubmit={(d) => save("balances", null, { accountId: accId, recordedOn: d.recordedOn, balance: d.balance, equity: nn(d.equity), note: fixBalance ? `Correction of ${dt(fixBalance.createdAt)} snapshot: ${d.note}`.slice(0, 10000) : d.note })}>
            {(d, set) => <>
              <Field label="Balance date" hint="The date this balance applies to. Past dates are supported." className="sm:col-span-2"><TextIn type="date" max={today()} value={d.recordedOn} onChange={(v) => set("recordedOn", v)} testId="input-balance-date" /></Field>
              <Field label={`New balance (${acc?.currency ?? ""})`}><MoneyIn value={d.balance} onChange={(v) => set("balance", v)} testId="input-balance-value" /></Field>
              <Field label="Reported equity (optional)"><MoneyIn value={d.equity} onChange={(v) => set("equity", v)} testId="input-balance-equity" placeholder="" /></Field>
              <Field label={fixBalance ? "Correction note" : "Note"} className="sm:col-span-2"><TextArea value={d.note} onChange={(v) => set("note", v)} testId="input-balance-note" /></Field>
            </>}
          </EditorDialog>
        );
      })()}
    </div>
  );
}

function BalancePanel({ p, account, onAdd, onFix }: { p: Portfolio; account: PropAccount; onAdd: () => void; onFix: (b: PropBalance) => void }) {
  const s = accountSnapshot(p, account.id);
  const cur = account.currency;
  const points = balanceChartPoints(account, s.balances);
  return (
    <Panel title={`Balance history · ${account.name}`} meta={`${cur}, manual snapshots`}
      actions={<Button size="sm" onClick={onAdd} data-testid="button-add-balance"><Plus className="h-3.5 w-3.5 mr-1" />Record balance</Button>}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[["Starting", account.startingBalance], ["Latest balance", s.balance], ["Highest recorded", s.highest], ["Equity", s.equity]].map(([l, v]) => (
          <div key={l}><div className="eyebrow">{l}</div><div className="num text-[15px] mt-1">{v === null ? "Not recorded" : money(v, cur)}</div></div>
        ))}
        <div title="Latest balance minus starting balance. Manual payout deductions, resets and other adjustments may also affect this difference; use the linked journal for trade-only P&L."><div className="eyebrow">Balance change vs start</div><Money v={s.onAccountProfit} currency={cur} className="text-[15px] mt-1 block" /></div>
      </div>
      {s.balances.length ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points}>
            <CartesianGrid vertical={false} stroke="hsl(220 6% 14%)" />
            <XAxis type="number" dataKey="t" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => balanceDateLabel(new Date(t).toISOString().slice(0, 10))} tick={axisTick} stroke="hsl(220 6% 18%)" />
            <YAxis type="number" domain={["auto", "auto"]} tickFormatter={(v: number) => money(v, cur, { compact: true })} tick={axisTick} stroke="hsl(220 6% 18%)" width={64} />
            <RTooltip contentStyle={tipStyle} labelFormatter={(t: number) => balanceDateLabel(new Date(t).toISOString().slice(0, 10))} formatter={(v: number) => [money(v, cur), "Recorded balance"]} />
            <Line type="stepAfter" dataKey="v" stroke="#61A9BD" strokeWidth={1.8} dot={points.length < 12} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : <ChartEmpty>No snapshots yet. The chart starts at the starting balance once you record the first update. Values between snapshots are not interpolated.</ChartEmpty>}
      {s.balances.length > 0 && <p className="text-[11.5px] text-muted-foreground mt-2">Progress follows balance dates. The chart shows the latest entry for each day; every original entry is retained below. Previous balances and differences follow chronological order.</p>}
      {s.balances.length > 0 && (
        <div className="overflow-x-auto -mx-4 mt-4">
          <table className="w-full text-[12.5px] min-w-[620px]">
            <thead><tr className="text-left text-muted-foreground border-y border-card-border">
              <th className="font-normal px-4 py-2">Balance date / Added</th><th className="font-normal px-3 py-2 text-right">Previous</th><th className="font-normal px-3 py-2 text-right">New</th>
              <th className="font-normal px-3 py-2 text-right">Difference</th><th className="font-normal px-3 py-2 text-right">Equity</th><th className="font-normal px-3 py-2">Note</th><th className="px-4" />
            </tr></thead>
            <tbody>
              {[...s.balances].reverse().map((b) => (
                <tr key={b.id} className="border-b border-card-border/60 last:border-0 row-hover" data-testid={`row-balance-${b.id}`}>
                  <td className="px-4 py-2 num text-[11.5px]"><div>{balanceDateLabel(balanceDate(b))}</div><div className="text-muted-foreground text-[10.5px]">Added {dt(b.createdAt)}</div></td>
                  <td className="px-3 py-2 text-right num">{money(b.previousBalance, cur)}</td>
                  <td className="px-3 py-2 text-right num">{money(b.balance, cur)}</td>
                  <td className="px-3 py-2 text-right"><Money v={b.difference} currency={cur} /></td>
                  <td className="px-3 py-2 text-right num text-muted-foreground">{b.equity ? money(b.equity, cur) : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[240px] truncate">{b.note}</td>
                  <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => onFix(b)} data-testid={`button-fix-balance-${b.id}`}>Append correction</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
