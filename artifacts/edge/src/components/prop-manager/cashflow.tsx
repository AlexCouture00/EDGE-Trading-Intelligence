import { useState } from "react";
import { Pencil, Plus, Receipt, Banknote, Trash2 } from "lucide-react";
import type { PropExpense, PropExpenseInput, PropPayout, PropPayoutInput } from "@workspace/api-client-react";
import { sumMoney, type Portfolio } from "@workspace/prop-math";
import { Caution, Empty, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { monthLabel } from "@/lib/month-label";
import { ConfirmDelete, EXPENSE_CATEGORY, EditorDialog, Field, MoneyIn, PAYOUT_STATUS, Pill, Sel, TextArea, TextIn, UMONEY_RE, nn, statusTone, today, usePropMutations } from "./shared";

const NONE = "__none";
type PDraft = Omit<PropPayoutInput, "grossProfit" | "profitSplit" | "paidOn"> & { grossProfit: string; profitSplit: string; paidOn: string };
const totalsBy = (rows: PropExpense[], key: (e: PropExpense) => string) => {
  const m = new Map<string, PropExpense[]>();
  rows.forEach((e) => m.set(key(e), [...(m.get(key(e)) ?? []), e]));
  return [...m.entries()].map(([k, list]) => ({ k, total: sumMoney(list.map((x) => x.amount)) }));
};

export function Expenses({ p }: { p: Portfolio }) {
  const { save, remove } = usePropMutations();
  const [editing, setEditing] = useState<{ id: string | null; draft: PropExpenseInput } | null>(null);
  const [deleting, setDeleting] = useState<PropExpense | null>(null);
  const firm = (id: string | null) => id ? p.firms.find((f) => f.id === id)?.name ?? "Unknown" : "General trading";
  const acc = (id: string | null) => (id ? p.accounts.find((a) => a.id === id)?.name ?? "Unknown" : "Firm-level");
  const blank: PropExpenseInput = { firmId: null, accountId: null, category: "software", amount: "", currency: "USD", date: today(), notes: "" };
  const rows = [...p.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const byFirm = totalsBy(p.expenses, (e) => `${firm(e.firmId)}|${e.currency}`);
  const byAcc = totalsBy(p.expenses, (e) => `${e.firmId ? acc(e.accountId) : "General trading"}|${e.currency}`);
  const byMonth = totalsBy(p.expenses, (e) => `${e.date.slice(0, 7)}|${e.currency}`).sort((a, b) => b.k.localeCompare(a.k));
  const lifetime = totalsBy(p.expenses, (e) => `Lifetime|${e.currency}`);
  return (
    <div className="space-y-5">
      {p.expenses.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {[["Lifetime", lifetime], ["Per firm", byFirm], ["Per account", byAcc], ["Monthly", byMonth]].map(([t, list]) => (
            <Panel key={t as string} title={t as string} bodyClass="p-0 max-h-[220px] overflow-y-auto">
              {(list as { k: string; total: string }[]).map(({ k, total }) => { const [n, c] = k.split("|"); return (
                <div key={k} className="flex justify-between gap-3 px-4 py-2 text-[12.5px] border-b border-card-border/60 last:border-0"><span className="truncate text-muted-foreground">{t === "Monthly" ? monthLabel(n) : n}</span><span className="num">{money(total, c)}</span></div>
              ); })}
            </Panel>
          ))}
        </div>
      )}
      <Panel title="Expenses" meta="kept even when accounts fail, close or archive" bodyClass="p-0"
        actions={<Button size="sm" onClick={() => setEditing({ id: null, draft: blank })} data-testid="button-add-expense"><Plus className="h-3.5 w-3.5 mr-1" />Add expense</Button>}>
        {!rows.length ? <div className="p-4"><Empty icon={<Receipt className="h-4 w-4" />} title="No expenses" body="Record software, subscriptions, other trading costs or prop firm fees to compute net cash profit. General trading expenses need no firm or account." /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-[12.5px] min-w-[680px]">
            <thead><tr className="text-left text-muted-foreground border-b border-card-border"><th className="font-normal px-4 py-2">Date</th><th className="font-normal px-3 py-2">Firm / account</th><th className="font-normal px-3 py-2">Category</th><th className="font-normal px-3 py-2 text-right">Amount</th><th className="font-normal px-3 py-2">Notes</th><th className="px-4" /></tr></thead>
            <tbody>{rows.map((e) => (
              <tr key={e.id} className="border-b border-card-border/60 last:border-0 row-hover" data-testid={`row-expense-${e.id}`}>
                <td className="px-4 py-2 num text-[11.5px]">{e.date}</td>
                <td className="px-3 py-2">{firm(e.firmId)}{e.firmId && <span className="text-muted-foreground"> · {acc(e.accountId)}</span>}</td>
                <td className="px-3 py-2">{EXPENSE_CATEGORY[e.category]}</td>
                <td className="px-3 py-2 text-right num text-neg">{money(e.amount, e.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground max-w-[220px] truncate">{e.notes}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: e.id, draft: { firmId: e.firmId, accountId: e.accountId, category: e.category, amount: e.amount, currency: e.currency, date: e.date, notes: e.notes } })} data-testid={`button-edit-expense-${e.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-neg" onClick={() => setDeleting(e)} data-testid={`button-delete-expense-${e.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
      {editing && (
        <EditorDialog key={editing.id ?? "new"} open onClose={() => setEditing(null)} initial={editing.draft} title={editing.id ? "Edit expense" : "Add expense"}
          description="Payout processing fees belong on the payout record. Do not add them here again."
          validate={(d) => !UMONEY_RE.test(d.amount) ? "Amount must be a positive decimal." : !/^[A-Z]{3}$/.test(d.currency) ? "Currency must be a 3-letter code." : null}
          onSubmit={(d) => save("expenses", editing.id, d)}>
          {(d, set) => <>
            <Field label="Firm (optional)"><Sel value={d.firmId ?? NONE} disabled={!!editing.id} onChange={(v) => { set("firmId", v === NONE ? null : v); set("accountId", null); }} options={[[NONE, "General trading · no firm"], ...p.firms.map((f) => [f.id, f.name] as [string, string])]} testId="select-expense-firm" /></Field>
            <Field label="Account (optional)"><Sel value={d.accountId ?? NONE} disabled={!!editing.id} onChange={(v) => { set("accountId", v === NONE ? null : v); const a = p.accounts.find((x) => x.id === v); if (a) set("currency", a.currency); }}
              options={[[NONE, d.firmId ? "Firm-level" : "Not linked"], ...p.accounts.filter((a) => a.firmId === d.firmId).map((a) => [a.id, a.name] as [string, string])]} testId="select-expense-account" /></Field>
            <Field label="Category"><Sel value={d.category} onChange={(v) => set("category", v as PropExpenseInput["category"])} options={Object.entries(EXPENSE_CATEGORY)} testId="select-expense-category" /></Field>
            <Field label="Date"><TextIn type="date" value={d.date} onChange={(v) => set("date", v)} testId="input-expense-date" /></Field>
            <Field label="Amount"><MoneyIn value={d.amount} onChange={(v) => set("amount", v)} testId="input-expense-amount" /></Field>
            <Field label="Currency"><TextIn value={d.currency} onChange={(v) => set("currency", v.toUpperCase().slice(0, 3))} testId="input-expense-currency" /></Field>
            <Field label="Notes" className="sm:col-span-2"><TextArea value={d.notes} onChange={(v) => set("notes", v)} testId="input-expense-notes" /></Field>
            <div className="sm:col-span-2 rounded-md border border-dashed border-border px-3 py-2 text-[11.5px] text-muted-foreground">Receipt attachments are not available yet. Note the receipt reference above for now.</div>
          </>}
        </EditorDialog>
      )}
      {deleting && <ConfirmDelete open onClose={() => setDeleting(null)} what={`${money(deleting.amount, deleting.currency)} expense`} onConfirm={() => remove("expenses", deleting.id)} />}
    </div>
  );
}

export function Payouts({ p }: { p: Portfolio }) {
  const { save, remove } = usePropMutations();
  const [editing, setEditing] = useState<{ id: string | null; draft: PDraft } | null>(null);
  const [deleting, setDeleting] = useState<PropPayout | null>(null);
  const acc = (id: string) => p.accounts.find((a) => a.id === id);
  const firm = (id?: string) => p.firms.find((f) => f.id === id)?.name ?? "";
  const first = p.accounts[0];
  const blank: PDraft = { accountId: first?.id ?? "", grossProfit: "", profitSplit: "", requestedAmount: "", netReceived: "0", currency: first?.currency ?? "USD", requestedOn: today(), paidOn: "", status: "requested", processingFee: "0", notes: "" };
  const rows = [...p.payouts].sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));
  return (
    <div className="space-y-5">
      <Caution>Only payouts marked Paid count as realized cash (net received). Requested and approved payouts are reported as pending. Recording a payout never changes an account balance; if the firm deducted it, record a new balance snapshot in Accounts.</Caution>
      <Panel title="Payouts" meta={`${p.payouts.length} recorded`} bodyClass="p-0"
        actions={<Button size="sm" disabled={!p.accounts.length} onClick={() => setEditing({ id: null, draft: blank })} data-testid="button-add-payout"><Plus className="h-3.5 w-3.5 mr-1" />Add payout</Button>}>
        {!rows.length ? <div className="p-4"><Empty icon={<Banknote className="h-4 w-4" />} title="No payouts" body="Record payout requests as they happen; mark them Paid once cash arrives." /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-[12.5px] min-w-[760px]">
            <thead><tr className="text-left text-muted-foreground border-b border-card-border"><th className="font-normal px-4 py-2">Requested</th><th className="font-normal px-3 py-2">Account</th><th className="font-normal px-3 py-2">Status</th><th className="font-normal px-3 py-2 text-right">Requested</th><th className="font-normal px-3 py-2 text-right">Net received</th><th className="font-normal px-3 py-2 text-right">Fee (withheld)</th><th className="font-normal px-3 py-2">Paid on</th><th className="px-4" /></tr></thead>
            <tbody>{rows.map((x) => { const a = acc(x.accountId); return (
              <tr key={x.id} className="border-b border-card-border/60 last:border-0 row-hover" data-testid={`row-payout-${x.id}`}>
                <td className="px-4 py-2 num text-[11.5px]">{x.requestedOn}</td>
                <td className="px-3 py-2">{a?.name}<span className="text-muted-foreground"> · {firm(a?.firmId)}</span></td>
                <td className="px-3 py-2"><Pill tone={statusTone(x.status)}>{PAYOUT_STATUS[x.status]}</Pill></td>
                <td className="px-3 py-2 text-right num">{money(x.requestedAmount, x.currency)}</td>
                <td className="px-3 py-2 text-right num text-pos">{x.status === "paid" ? money(x.netReceived, x.currency) : "—"}</td>
                <td className="px-3 py-2 text-right num text-muted-foreground">{money(x.processingFee, x.currency)}</td>
                <td className="px-3 py-2 num text-[11.5px] text-muted-foreground">{x.paidOn ?? "—"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: x.id, draft: { accountId: x.accountId, requestedAmount: x.requestedAmount, netReceived: x.netReceived, currency: x.currency, requestedOn: x.requestedOn, status: x.status, processingFee: x.processingFee, notes: x.notes, grossProfit: x.grossProfit ?? "", profitSplit: x.profitSplit ?? "", paidOn: x.paidOn ?? "" } })} data-testid={`button-edit-payout-${x.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-neg" onClick={() => setDeleting(x)} data-testid={`button-delete-payout-${x.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ); })}</tbody>
          </table></div>
        )}
      </Panel>
      {editing && (
        <EditorDialog key={editing.id ?? "new"} open onClose={() => setEditing(null)} initial={editing.draft} title={editing.id ? "Edit payout" : "Add payout"}
          description="The processing fee is informational: it is already withheld from net received. It is not subtracted again and needs no separate withdrawal expense."
          validate={(d) => !d.accountId ? "Choose an account." : !UMONEY_RE.test(d.requestedAmount) || !UMONEY_RE.test(d.netReceived) || !UMONEY_RE.test(d.processingFee) ? "Requested, net received and fee must be positive decimals (0 allowed)."
            : d.grossProfit && !UMONEY_RE.test(d.grossProfit) ? "Gross profit must be a decimal or empty." : d.profitSplit && !/^\d{1,3}(\.\d{1,4})?$/.test(d.profitSplit) ? "Profit split is a percentage, e.g. 80."
            : d.status === "paid" && !d.paidOn ? "Paid payouts need a payment date." : null}
          onSubmit={(d) => save("payouts", editing.id, { ...d, grossProfit: nn(d.grossProfit), profitSplit: nn(d.profitSplit), paidOn: nn(d.paidOn) })}>
          {(d, set) => <>
            <Field label="Account"><Sel value={d.accountId} disabled={!!editing.id} onChange={(v) => { set("accountId", v); const a = acc(v); if (a) set("currency", a.currency); }} options={p.accounts.map((a) => [a.id, `${a.name} · ${firm(a.firmId)}`])} testId="select-payout-account" /></Field>
            <Field label="Status"><Sel value={d.status} onChange={(v) => set("status", v as PDraft["status"])} options={Object.entries(PAYOUT_STATUS)} testId="select-payout-status" /></Field>
            <Field label="Gross profit (optional)"><MoneyIn value={d.grossProfit} onChange={(v) => set("grossProfit", v)} testId="input-payout-gross" placeholder="" /></Field>
            <Field label="Profit split % (optional)"><TextIn value={d.profitSplit} inputMode="decimal" onChange={(v) => set("profitSplit", v)} testId="input-payout-split" placeholder="80" /></Field>
            <Field label="Requested payout"><MoneyIn value={d.requestedAmount} onChange={(v) => set("requestedAmount", v)} testId="input-payout-requested" /></Field>
            <Field label="Net received" hint="Cash that actually arrived, after fees"><MoneyIn value={d.netReceived} onChange={(v) => set("netReceived", v)} testId="input-payout-net" /></Field>
            <Field label="Processing fee (withheld)"><MoneyIn value={d.processingFee} onChange={(v) => set("processingFee", v)} testId="input-payout-fee" /></Field>
            <Field label="Currency"><TextIn value={d.currency} onChange={(v) => set("currency", v.toUpperCase().slice(0, 3))} testId="input-payout-currency" /></Field>
            <Field label="Request date"><TextIn type="date" value={d.requestedOn} onChange={(v) => set("requestedOn", v)} testId="input-payout-requestedon" /></Field>
            <Field label="Payment date"><TextIn type="date" value={d.paidOn} onChange={(v) => set("paidOn", v)} testId="input-payout-paidon" /></Field>
            <Field label="Notes" className="sm:col-span-2"><TextArea value={d.notes} onChange={(v) => set("notes", v)} testId="input-payout-notes" /></Field>
          </>}
        </EditorDialog>
      )}
      {deleting && <ConfirmDelete open onClose={() => setDeleting(null)} what="this payout" onConfirm={() => remove("payouts", deleting.id)} />}
    </div>
  );
}
