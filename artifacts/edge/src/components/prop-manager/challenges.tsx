import { useState } from "react";
import { Flag, Pencil, Plus } from "lucide-react";
import type { PropChallenge, PropChallengeInput } from "@workspace/api-client-react";
import { accountSnapshot, challengeProgress, type Portfolio } from "@workspace/prop-math";
import { Empty, Money, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { CHALLENGE_STATUS, EditorDialog, Field, MONEY_RE, MoneyIn, Pill, STRUCTURES, Sel, TextArea, TextIn, UMONEY_RE, nn, statusTone, today, usePropMutations } from "./shared";

type Draft = Omit<PropChallengeInput, "dailyLoss" | "expiresOn" | "minimumDays" | "completedDays"> & { dailyLoss: string; expiresOn: string; minimumDays: string; completedDays: string };
const toDraft = (c: PropChallengeInput): Draft => ({ accountId: c.accountId, name: c.name, structure: c.structure, phase: c.phase, startingBalance: c.startingBalance, profitTarget: c.profitTarget, maximumLoss: c.maximumLoss, startDate: c.startDate, status: c.status, notes: c.notes, dailyLoss: c.dailyLoss ?? "", expiresOn: c.expiresOn ?? "", minimumDays: String(c.minimumDays), completedDays: String(c.completedDays) });

export function Challenges({ p }: { p: Portfolio }) {
  const { save } = usePropMutations();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft; locked?: boolean } | null>(null);
  const acc = (id: string) => p.accounts.find((a) => a.id === id);
  const firm = (id?: string) => p.firms.find((f) => f.id === id)?.name ?? "";
  const startNew = (from?: PropChallenge) => {
    const a = from ? acc(from.accountId) : p.accounts[0];
    const base: PropChallengeInput = from
      ? { ...from, phase: "", startingBalance: a ? accountSnapshot(p, a.id).balance : from.startingBalance, completedDays: 0, startDate: today(), expiresOn: null, status: "active", notes: "" }
      : { accountId: a?.id ?? "", name: "", structure: "two_step", phase: "Phase 1", startingBalance: a?.startingBalance ?? "", profitTarget: "", maximumLoss: "", dailyLoss: null, minimumDays: 0, completedDays: 0, startDate: today(), expiresOn: null, status: "active", notes: "" };
    setEditing({ id: null, draft: toDraft(base) });
  };
  const groups = [...new Set(p.challenges.map((c) => `${c.accountId}|${c.name}`))];

  return (
    <Panel title="Challenge tracker" meta="each phase is its own record; history is kept" bodyClass="space-y-3"
      actions={<Button size="sm" disabled={!p.accounts.length} onClick={() => startNew()} data-testid="button-add-challenge"><Plus className="h-3.5 w-3.5 mr-1" />New challenge</Button>}>
      <p className="text-[12px] text-muted-foreground">Targets are amounts. Trading days are entered manually. Pass or fail is the status you record; reaching a target never marks a phase passed automatically.</p>
      {!p.challenges.length ? <Empty icon={<Flag className="h-4 w-4" />} title="No challenges" body={p.accounts.length ? "Record an evaluation phase to track its target, loss limits and days." : "Add a prop account first."} /> : groups.map((g) => {
        const list = p.challenges.filter((c) => `${c.accountId}|${c.name}` === g).sort((a, b) => a.startDate.localeCompare(b.startDate));
        const a = acc(list[0].accountId);
        return (
          <div key={g} className="rounded-md border border-card-border">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-card-border">
              <div><span className="text-[13.5px] font-medium">{list[0].name}</span><span className="text-[12px] text-muted-foreground ml-2">{firm(a?.firmId)} · {a?.name} · {STRUCTURES[list[0].structure]}</span></div>
              <Button size="sm" variant="outline" onClick={() => startNew(list[list.length - 1])} data-testid={`button-next-phase-${list[0].id}`}><Plus className="h-3.5 w-3.5 mr-1" />Next phase</Button>
            </div>
            <div className="divide-y divide-card-border">
              {list.map((c) => {
                const pr = challengeProgress(p, c);
                const cur = a?.currency ?? "USD";
                return (
                  <div key={c.id} className="px-4 py-3 grid gap-3 md:grid-cols-[1.2fr_2fr_auto] md:items-center" data-testid={`row-challenge-${c.id}`}>
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px]">{c.phase}</span><Pill tone={statusTone(c.status)}>{CHALLENGE_STATUS[c.status]}</Pill>
                      {c.closingBalance !== null && <Pill>Closed at {money(c.closingBalance, a?.currency ?? "USD")}</Pill>}<span className="text-[11px] text-muted-foreground num">{c.startDate}{c.expiresOn ? ` to ${c.expiresOn}` : ""}</span></div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11.5px] text-muted-foreground"><span>Profit <Money v={pr.profit} currency={cur} /> of {money(c.profitTarget, cur)}</span><span className="num">{pr.progress === null ? "No target" : `${pr.progress.toFixed(1)}%`}</span></div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-[hsl(var(--signal))] origin-left transition-transform" style={{ transform: `scaleX(${(pr.progress ?? 0) / 100})` }} /></div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px]">
                        <div><span className="text-muted-foreground">Balance </span><span className="num">{money(pr.balance, cur)}</span></div>
                        <div><span className="text-muted-foreground">Still needed </span><span className="num">{money(pr.requiredProfit, cur)}</span></div>
                        <div title="Max loss is a recorded limit only. No calculation method is confirmed for this phase, so remaining drawdown is not computed. See confirmed rules in Rules."><span className="text-muted-foreground">Max loss </span><span className="num">{money(c.maximumLoss, cur)}</span><span className="text-caution"> · remaining: Not enough data</span></div>
                        <div><span className="text-muted-foreground">Days </span><span className="num">{c.completedDays}/{c.minimumDays}</span>{c.dailyLoss && <span className="text-muted-foreground"> · daily {money(c.dailyLoss, cur)}</span>}</div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, draft: toDraft(c), locked: c.completedAt !== null || ["passed", "failed", "expired"].includes(c.status) })} data-testid={`button-edit-challenge-${c.id}`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {editing && (
        <EditorDialog key={editing.id ?? "new"} open onClose={() => setEditing(null)} initial={editing.draft} title={editing.id ? "Edit challenge phase" : "Record challenge phase"}
          description={editing.locked ? "This phase is completed. Its result, phase, starting balance and target are frozen; add a next phase instead of rewriting history." : "Use the same challenge name across phases to keep them grouped. Fees stay in Expenses; nothing is removed when a phase ends."}
          validate={(d) => !d.accountId ? "Choose an account." : !d.name.trim() || !d.phase.trim() ? "Name and phase are required."
            : !MONEY_RE.test(d.startingBalance) || !MONEY_RE.test(d.profitTarget) || !MONEY_RE.test(d.maximumLoss) ? "Starting balance, target and max loss must be plain decimals."
            : d.dailyLoss && !UMONEY_RE.test(d.dailyLoss) ? "Daily loss must be a positive decimal or empty."
            : !/^\d+$/.test(d.minimumDays) || !/^\d+$/.test(d.completedDays) ? "Days must be whole numbers." : null}
          onSubmit={(d) => save("challenges", editing.id, { ...d, name: d.name.trim(), phase: d.phase.trim(), dailyLoss: nn(d.dailyLoss), expiresOn: nn(d.expiresOn), minimumDays: Number(d.minimumDays), completedDays: Number(d.completedDays) })}>
          {(d, set) => <>
            <Field label="Account"><Sel value={d.accountId} disabled={!!editing.id} onChange={(v) => set("accountId", v)} options={p.accounts.map((a) => [a.id, `${a.name} · ${firm(a.firmId)}`])} testId="select-challenge-account" /></Field>
            <Field label="Challenge name"><TextIn value={d.name} onChange={(v) => set("name", v)} testId="input-challenge-name" placeholder="e.g. 100K Evaluation" /></Field>
            <Field label="Challenge type"><Sel value={d.structure} onChange={(v) => set("structure", v as Draft["structure"])} options={Object.entries(STRUCTURES)} testId="select-challenge-structure" /></Field>
            <Field label="Evaluation phase"><TextIn value={d.phase} disabled={editing.locked} onChange={(v) => set("phase", v)} testId="input-challenge-phase" /></Field>
            <Field label="Starting balance"><MoneyIn value={d.startingBalance} disabled={editing.locked} onChange={(v) => set("startingBalance", v)} testId="input-challenge-start" /></Field>
            <Field label="Profit target (amount)"><MoneyIn value={d.profitTarget} disabled={editing.locked} onChange={(v) => set("profitTarget", v)} testId="input-challenge-target" /></Field>
            <Field label="Maximum loss (amount)"><MoneyIn value={d.maximumLoss} onChange={(v) => set("maximumLoss", v)} testId="input-challenge-maxloss" /></Field>
            <Field label="Daily loss limit (optional)"><MoneyIn value={d.dailyLoss} onChange={(v) => set("dailyLoss", v)} testId="input-challenge-dailyloss" placeholder="" /></Field>
            <Field label="Minimum trading days"><TextIn value={d.minimumDays} inputMode="numeric" onChange={(v) => set("minimumDays", v)} testId="input-challenge-mindays" /></Field>
            <Field label="Days completed (confirmed)"><TextIn value={d.completedDays} inputMode="numeric" onChange={(v) => set("completedDays", v)} testId="input-challenge-days" /></Field>
            <Field label="Start date"><TextIn type="date" value={d.startDate} onChange={(v) => set("startDate", v)} testId="input-challenge-startdate" /></Field>
            <Field label="Expiration (optional)"><TextIn type="date" value={d.expiresOn} onChange={(v) => set("expiresOn", v)} testId="input-challenge-expires" /></Field>
            <Field label="Status"><Sel value={d.status} disabled={editing.locked} onChange={(v) => set("status", v as Draft["status"])} options={Object.entries(CHALLENGE_STATUS)} testId="select-challenge-status" /></Field>
            <Field label="Notes" className="sm:col-span-2"><TextArea value={d.notes} onChange={(v) => set("notes", v)} testId="input-challenge-notes" /></Field>
          </>}
        </EditorDialog>
      )}
    </Panel>
  );
}
