import { useState } from "react";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import type { PropRule } from "@workspace/api-client-react";
import { evaluateRule, type Portfolio } from "@workspace/prop-math";
import { Empty, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { money } from "@/lib/format";
import { ConfirmDelete, EditorDialog, Field, Pill, RULE_CATEGORY, RULE_METHOD, Sel, TextArea, TextIn, today, usePropMutations } from "./shared";
import { accountsForRuleFirm, createRuleDraft, ruleInput, validateRuleDraft, type RuleDraft as Draft } from "./rule-draft";

export function Rules({ p }: { p: Portfolio }) {
  const { save, remove } = usePropMutations();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<PropRule | null>(null);
  const blank = createRuleDraft(p, today());
  const used = p.accounts.filter((a) => p.rules.some((r) => r.accountId === a.id));
  return (
    <Panel title="Rules tracker" meta="per account, entered and confirmed by you" bodyClass="space-y-4"
      actions={<Button size="sm" disabled={!p.accounts.length} onClick={() => setEditing({ id: null, draft: blank })} data-testid="button-add-rule"><Plus className="h-3.5 w-3.5 mr-1" />Add rule</Button>}>
      <p className="text-[12px] text-muted-foreground">No rules are fetched or assumed. A rule is active only once confirmed and effective. Only static balance-loss rules in amount or % can be estimated from snapshots; everything else shows Not enough data.</p>
      {!p.rules.length ? <Empty icon={<ListChecks className="h-4 w-4" />} title="No rules recorded" body="Enter each firm's rules for the specific account, with the source you verified them against." /> : used.map((a) => (
        <div key={a.id} className="rounded-md border border-card-border">
          <div className="px-4 py-2 border-b border-card-border text-[13px] font-medium">{p.firms.find((firm) => firm.id === a.firmId)?.name ?? "Prop firm"} · {a.name}</div>
          <div className="divide-y divide-card-border">
            {p.rules.filter((r) => r.accountId === a.id).map((r) => {
              const ev = evaluateRule(p, r);
              return (
                <div key={r.id} className="px-4 py-2.5 grid gap-2 md:grid-cols-[1.4fr_1fr_1.6fr_auto] md:items-center row-hover" data-testid={`row-rule-${r.id}`}>
                  <div className="min-w-0"><div className="text-[13px]">{r.name}</div><div className="text-[11px] text-muted-foreground">{RULE_CATEGORY[r.category]} · {RULE_METHOD[r.method]}</div></div>
                  <div className="num text-[12.5px]">{r.value} {r.unit}</div>
                  <div className="text-[11.5px]">
                    {ev.status === "not_confirmed" ? <Pill>Not active</Pill> : ev.status === "not_enough_data" ? <Pill tone="caution">Not enough data</Pill>
                      : <span className="num">Snapshot room {money(ev.remaining, a.currency)}</span>}
                    <div className="text-muted-foreground mt-0.5">{ev.explanation}</div>
                  </div>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: r.id, draft: createRuleDraft(p, today(), r) })} data-testid={`button-edit-rule-${r.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-neg" onClick={() => setDeleting(r)} data-testid={`button-delete-rule-${r.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {editing && (
        <EditorDialog key={editing.id ?? "new"} open onClose={() => setEditing(null)} initial={editing.draft} title={editing.id ? "Edit rule" : "Add rule"}
          validate={(d) => validateRuleDraft(p, d)}
          onSubmit={(d) => save("rules", editing.id, ruleInput(d))}>
          {(d, set) => <>
            <Field label="Prop firm" hint={editing.id ? "The firm and account of an existing rule cannot be changed." : undefined}>
              <Sel value={d.firmId} disabled={!!editing.id} onChange={(v) => { set("firmId", v); set("accountId", ""); }}
                options={p.firms.map((firm) => [firm.id, `${firm.name}${firm.status === "archived" ? " (archived)" : ""}`])} placeholder="Choose a prop firm" testId="select-rule-firm" />
            </Field>
            <Field label="Account" hint={d.firmId && !accountsForRuleFirm(p, d.firmId).length ? "Create an account for this firm in Accounts & balances first." : undefined}>
              <Sel value={d.accountId} disabled={!!editing.id || !d.firmId || !accountsForRuleFirm(p, d.firmId).length}
                onChange={(v) => set("accountId", v)} options={accountsForRuleFirm(p, d.firmId).map((a) => [a.id, a.name])} placeholder="Choose an account" testId="select-rule-account" />
            </Field>
            <Field label="Rule name"><TextIn value={d.name} onChange={(v) => set("name", v)} testId="input-rule-name" /></Field>
            <Field label="Category"><Sel value={d.category} onChange={(v) => set("category", v as Draft["category"])} options={Object.entries(RULE_CATEGORY)} testId="select-rule-category" /></Field>
            <Field label="Calculation method"><Sel value={d.method} onChange={(v) => set("method", v as Draft["method"])} options={Object.entries(RULE_METHOD)} testId="select-rule-method" /></Field>
            <Field label="Value" hint="Number, Yes / No / Conditional, or text"><TextIn value={d.value} onChange={(v) => set("value", v)} testId="input-rule-value" /></Field>
            <Field label="Unit" hint="Use 'amount' or '%' for static balance-loss estimates"><TextIn value={d.unit} onChange={(v) => set("unit", v)} testId="input-rule-unit" /></Field>
            <Field label="Effective date"><TextIn type="date" value={d.effectiveDate} onChange={(v) => set("effectiveDate", v)} testId="input-rule-effective" /></Field>
            <Field label="Last verified (optional)"><TextIn type="date" value={d.verifiedOn} onChange={(v) => set("verifiedOn", v)} testId="input-rule-verified" /></Field>
            <Field label="Source URL" className="sm:col-span-2"><TextIn value={d.sourceUrl} onChange={(v) => set("sourceUrl", v)} inputMode="url" testId="input-rule-source" /></Field>
            <Field label="Explanation" className="sm:col-span-2"><TextArea value={d.explanation} onChange={(v) => set("explanation", v)} testId="input-rule-explanation" /></Field>
            <Field label="Notes" className="sm:col-span-2"><TextArea value={d.notes} onChange={(v) => set("notes", v)} testId="input-rule-notes" /></Field>
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-card-border px-3 py-2.5">
              <div><div className="text-[13px]">I confirm this rule</div><div className="text-[11.5px] text-muted-foreground">Unconfirmed rules are never treated as active.</div></div>
              <Switch checked={d.confirmed} onCheckedChange={(v) => set("confirmed", v)} data-testid="switch-rule-confirmed" />
            </div>
          </>}
        </EditorDialog>
      )}
      {deleting && <ConfirmDelete open onClose={() => setDeleting(null)} what={`rule "${deleting.name}"`} onConfirm={() => remove("rules", deleting.id)} />}
    </Panel>
  );
}
