import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, Pencil, Plus } from "lucide-react";
import {
  useCreateAccount, useUpdateAccount, useListCashFlows, useCreateCashFlow, useListConfluences, useCreateConfluence, useUpdateConfluence, useGetSettings, useUpdateSettings,
  getListCashFlowsQueryKey, type Account, type AccountInputType, type CashFlowInputType, type Confluence, type ConfluenceInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NSelect } from "@/components/nselect";
import { Empty, ErrorBlock, LoadingBlock, Money, PageHeader, Panel, WriteGate } from "@/components/kit";
import { useFilters } from "@/lib/filters";
import { useMode } from "@/lib/mode";
import { useToast } from "@/hooks/use-toast";
import { ACCOUNT_TYPES, errMsg, money } from "@/lib/format";
import { useDateFormatter, useTimezone } from "@/lib/time";
import { fromZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";

const TABS = [{ id: "accounts", label: "Accounts" }, { id: "confluences", label: "Confluences" }, { id: "preferences", label: "Preferences" }];
const DEC = /^\d+(\.\d{1,8})?$/;

function useSave() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return {
    ok: (msg: string, after?: () => void) => () => { void qc.invalidateQueries(); toast({ title: msg }); after?.(); },
    fail: (e: unknown) => toast({ title: "Save failed", description: errMsg(e), variant: "destructive" }),
  };
}

function AccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (v: boolean) => void; account?: Account }) {
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const s = useSave();
  const [f, setF] = useState({ name: "", broker: "", currency: "USD", initialBalance: "", type: "personal_live" as AccountInputType });
  useEffect(() => {
    if (open) setF(account ? { name: account.name, broker: account.broker ?? "", currency: account.currency, initialBalance: account.initialBalance, type: account.type } : { name: "", broker: "", currency: "USD", initialBalance: "", type: "personal_live" });
  }, [open, account]);
  const valid = f.name.trim() && /^[A-Z]{3}$/.test(f.currency) && DEC.test(f.initialBalance);
  const save = () => {
    const data = { ...f, name: f.name.trim(), broker: f.broker.trim(), archived: account?.archived ?? false };
    if (account) update.mutate({ id: account.id, data }, { onSuccess: s.ok("Account updated", () => onOpenChange(false)), onError: s.fail });
    else create.mutate({ data }, { onSuccess: s.ok("Account created", () => onOpenChange(false)), onError: s.fail });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle><DialogDescription>Analytics never combine accounts in different currencies.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-account-name" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Broker</Label><Input value={f.broker} onChange={(e) => setF({ ...f, broker: e.target.value })} data-testid="input-account-broker" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Type</Label><NSelect value={f.type} onChange={(v) => setF({ ...f, type: v as AccountInputType })} className="h-9" testId="select-account-type" options={Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Currency</Label><Input value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} className="num" data-testid="input-account-currency" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Initial balance</Label><Input value={f.initialBalance} inputMode="decimal" onChange={(e) => setF({ ...f, initialBalance: e.target.value.replace(/[^\d.]/g, "") })} className="num" data-testid="input-account-balance" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid || create.isPending || update.isPending} onClick={save} data-testid="button-save-account">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashFlows({ account }: { account: Account }) {
  const dt = useDateFormatter();
  const timezone = useTimezone();
  const { dp, canWrite } = useMode();
  const q = useListCashFlows(account.id, dp, { query: { enabled: !!account.id, queryKey: getListCashFlowsQueryKey(account.id, dp) } });
  const create = useCreateCashFlow();
  const s = useSave();
  const [f, setF] = useState({ type: "deposit" as CashFlowInputType, amount: "", date: new Date().toISOString().slice(0, 10), note: "" });
  const add = () => {
    if (!DEC.test(f.amount)) return;
    create.mutate({ id: account.id, data: { type: f.type, amount: f.amount, date: fromZonedTime(f.date + "T00:00:00", timezone).toISOString(), note: f.note || undefined } }, { onSuccess: s.ok("Cash flow recorded", () => setF({ ...f, amount: "", note: "" })), onError: s.fail });
  };
  return (
    <div className="bg-background/40 border-t border-card-border px-4 py-4 space-y-3">
      <div className="eyebrow">Cash flows · excluded from trading P&L, included in balance</div>
      {q.isLoading ? <LoadingBlock rows={2} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : (q.data ?? []).length === 0 ? <p className="text-[12.5px] text-muted-foreground">No deposits, withdrawals or adjustments.</p> : (
        <div className="text-[12.5px]">
          {(q.data ?? []).map((c) => (
            <div key={c.id} className="grid grid-cols-[110px_100px_1fr_auto] gap-3 py-1.5 border-b border-card-border/50 last:border-0">
              <span className="num text-muted-foreground">{dt(c.date, "dd MMM yyyy")}</span><span className="capitalize">{c.type}</span><span className="text-muted-foreground truncate">{c.note}</span>
              <span className={cn("num", c.type === "withdrawal" ? "text-neg" : "text-pos")}>{c.type === "withdrawal" ? "-" : "+"}{money(c.amount, account.currency)}</span>
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2 items-end pt-1">
          <NSelect value={f.type} onChange={(v) => setF({ ...f, type: v as CashFlowInputType })} className="w-[130px]" testId={`select-cf-type-${account.id}`} options={[{ value: "deposit", label: "Deposit" }, { value: "withdrawal", label: "Withdrawal" }, { value: "adjustment", label: "Adjustment" }]} />
          <Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Amount" className="h-8 w-[110px] num text-[12.5px]" data-testid={`input-cf-amount-${account.id}`} />
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-8 w-[150px] num text-[12.5px]" data-testid={`input-cf-date-${account.id}`} />
          <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note" className="h-8 flex-1 min-w-[140px] text-[12.5px]" data-testid={`input-cf-note-${account.id}`} />
          <Button size="sm" onClick={add} disabled={!DEC.test(f.amount) || !f.date || create.isPending} data-testid={`button-add-cf-${account.id}`}>Add</Button>
        </div>
      )}
    </div>
  );
}

function Accounts() {
  const { canWrite } = useMode();
  const { accounts, accountsLoading, accountsError, refetchAccounts } = useFilters();
  const update = useUpdateAccount();
  const s = useSave();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>();
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (a: Account) => update.mutate({ id: a.id, data: { name: a.name, broker: a.broker, currency: a.currency, initialBalance: a.initialBalance, type: a.type, archived: !a.archived } }, { onSuccess: s.ok(a.archived ? "Account restored" : "Account archived"), onError: s.fail });
  return (
    <Panel title="Accounts" meta="Archive hides from filters but keeps history" bodyClass="p-0" actions={<WriteGate compact><Button size="sm" onClick={() => { setEditing(undefined); setOpen(true); }} data-testid="button-new-account"><Plus className="h-3.5 w-3.5 mr-1" />Account</Button></WriteGate>}>
      {accountsLoading ? <div className="p-4"><LoadingBlock rows={3} /></div> : accountsError ? <div className="p-4"><ErrorBlock error={accountsError} retry={refetchAccounts} /></div> : accounts.length === 0 ? (
        <Empty title="No accounts" body="Create an account to start logging trades against a balance." />
      ) : accounts.map((a) => (
        <div key={a.id} className={cn("border-b border-card-border last:border-0", a.archived && "opacity-60")} data-testid={`row-account-${a.id}`}>
          <div className="flex flex-wrap items-center gap-4 px-4 py-3">
            <button onClick={() => setExpanded(expanded === a.id ? null : a.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left" data-testid={`button-expand-account-${a.id}`}>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded === a.id && "rotate-180")} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium flex items-center gap-2">{a.name}{a.archived && <span className="eyebrow">Archived</span>}</div>
                <div className="text-[11.5px] text-muted-foreground">{ACCOUNT_TYPES[a.type]}{a.broker ? ` · ${a.broker}` : ""} · {a.currency}</div>
              </div>
            </button>
            <div className="text-right"><div className="eyebrow">Balance</div><div className="num text-[13px] mt-0.5">{money(a.balance, a.currency)}</div></div>
            <div className="text-right"><div className="eyebrow">Trading P&L</div><Money v={a.tradingPnl} currency={a.currency} className="text-[13px] mt-0.5 block" /></div>
            {canWrite && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(a); setOpen(true); }} data-testid={`button-edit-account-${a.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle(a)} title={a.archived ? "Restore" : "Archive"} data-testid={`button-archive-account-${a.id}`}>{a.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</Button>
              </div>
            )}
          </div>
          {expanded === a.id && <CashFlows account={a} />}
        </div>
      ))}
      <AccountDialog open={open} onOpenChange={setOpen} account={editing} />
    </Panel>
  );
}

const SWATCHES = ["#8FA9BF", "#C9B37E", "#7FB39A", "#C98B8B", "#A08FC0", "#8FBFBF", "#BFA08F", "#9AA0A8"];

function ConfluenceDialog({ open, onOpenChange, c, nextOrder }: { open: boolean; onOpenChange: (v: boolean) => void; c?: Confluence; nextOrder: number }) {
  const create = useCreateConfluence();
  const update = useUpdateConfluence();
  const s = useSave();
  const [f, setF] = useState({ name: "", description: "", category: "", color: SWATCHES[0] });
  useEffect(() => { if (open) setF(c ? { name: c.name, description: c.description ?? "", category: c.category ?? "", color: c.color ?? SWATCHES[0] } : { name: "", description: "", category: "", color: SWATCHES[nextOrder % SWATCHES.length] }); }, [open, c, nextOrder]);
  const save = () => {
    const data: ConfluenceInput = { ...f, name: f.name.trim(), enabled: c?.enabled ?? true, archived: c?.archived ?? false, sortOrder: c?.sortOrder ?? nextOrder };
    if (c) update.mutate({ id: c.id, data }, { onSuccess: s.ok("Confluence updated", () => onOpenChange(false)), onError: s.fail });
    else create.mutate({ data }, { onSuccess: s.ok("Confluence created", () => onOpenChange(false)), onError: s.fail });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{c ? "Edit confluence" : "New confluence"}</DialogTitle><DialogDescription>Renaming keeps history; past trades retain a snapshot of the name used at the time.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="HTF liquidity sweep" data-testid="input-confluence-name" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Category</Label><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Structure" data-testid="input-confluence-category" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Definition</Label><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What must be true for this to count?" data-testid="input-confluence-description" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Color</Label>
            <div className="flex gap-2">{SWATCHES.map((sw) => <button key={sw} type="button" onClick={() => setF({ ...f, color: sw })} className={cn("h-6 w-6 rounded-full border-2 transition-transform", f.color === sw ? "border-foreground scale-110" : "border-transparent")} style={{ background: sw }} data-testid={`button-swatch-${sw.slice(1)}`} />)}</div>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!f.name.trim() || create.isPending || update.isPending} onClick={save} data-testid="button-save-confluence">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfluenceManager() {
  const { dp, canWrite } = useMode();
  const q = useListConfluences(dp);
  const update = useUpdateConfluence();
  const s = useSave();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Confluence | undefined>();
  const [showArchived, setShowArchived] = useState(false);
  const all = [...(q.data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const list = all.filter((c) => showArchived || !c.archived);
  const input = (c: Confluence, patch: Partial<ConfluenceInput>): ConfluenceInput => ({ name: c.name, description: c.description, category: c.category, color: c.color, enabled: c.enabled, archived: c.archived, sortOrder: c.sortOrder, ...patch });
  const patch = (c: Confluence, p: Partial<ConfluenceInput>, msg: string) => update.mutate({ id: c.id, data: input(c, p) }, { onSuccess: s.ok(msg), onError: s.fail });
  const move = async (i: number, dir: -1 | 1) => {
    const a = list[i], b = list[i + dir];
    if (!a || !b) return;
    const ordered = all.map((c, idx) => ({ c, order: idx }));
    const ia = ordered.findIndex((o) => o.c.id === a.id), ib = ordered.findIndex((o) => o.c.id === b.id);
    try {
      await update.mutateAsync({ id: a.id, data: input(a, { sortOrder: ib }) });
      await update.mutateAsync({ id: b.id, data: input(b, { sortOrder: ia }) });
      s.ok("Order updated")();
    } catch (e) { s.fail(e); }
  };
  return (
    <Panel title="Confluences" meta="Enabled ones appear in the trade form" bodyClass="p-0"
      actions={<div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)} data-testid="button-toggle-archived-confluences">{showArchived ? "Hide archived" : "Show archived"}</Button><WriteGate compact><Button size="sm" onClick={() => { setEditing(undefined); setOpen(true); }} data-testid="button-new-confluence"><Plus className="h-3.5 w-3.5 mr-1" />Confluence</Button></WriteGate></div>}>
      {q.isLoading ? <div className="p-4"><LoadingBlock rows={6} /></div> : q.error ? <div className="p-4"><ErrorBlock error={q.error} retry={() => q.refetch()} /></div> : list.length === 0 ? <Empty title="No confluences" body="Confluences are the conditions you look for before entering. Add the first one." /> : list.map((c, i) => (
        <div key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5 border-b border-card-border/70 last:border-0 row-hover", (c.archived || c.enabled === false) && "opacity-55")} data-testid={`row-confluence-${c.id}`}>
          {canWrite && (
            <div className="flex flex-col -my-1">
              <button disabled={i === 0 || update.isPending} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-up-${c.id}`}><ArrowUp className="h-3 w-3" /></button>
              <button disabled={i === list.length - 1 || update.isPending} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-down-${c.id}`}><ArrowDown className="h-3 w-3" /></button>
            </div>
          )}
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color ?? "#888" }} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] flex items-center gap-2">{c.name}{c.category && <span className="text-[10.5px] text-muted-foreground border border-border rounded-sm px-1.5">{c.category}</span>}{c.archived && <span className="eyebrow">Archived</span>}</div>
            {c.description && <div className="text-[11.5px] text-muted-foreground truncate">{c.description}</div>}
          </div>
          {canWrite ? (
            <>
              <Switch checked={c.enabled !== false} disabled={!!c.archived} onCheckedChange={(v) => patch(c, { enabled: v }, v ? "Enabled" : "Disabled")} data-testid={`switch-enabled-${c.id}`} />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(c); setOpen(true); }} data-testid={`button-edit-confluence-${c.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => patch(c, { archived: !c.archived }, c.archived ? "Restored" : "Archived")} title={c.archived ? "Restore" : "Archive"} data-testid={`button-archive-confluence-${c.id}`}>{c.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</Button>
            </>
          ) : <span className="eyebrow">{c.enabled === false ? "Disabled" : "Enabled"}</span>}
        </div>
      ))}
      <ConfluenceDialog open={open} onOpenChange={setOpen} c={editing} nextOrder={all.length} />
    </Panel>
  );
}

function Preferences() {
  const { dp, canWrite } = useMode();
  const q = useGetSettings(dp);
  const upd = useUpdateSettings();
  const s = useSave();
  const [f, setF] = useState({ timezone: "", riskLimitPercent: "" });
  useEffect(() => { if (q.data) setF({ timezone: q.data.timezone, riskLimitPercent: q.data.riskLimitPercent }); }, [q.data]);
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["UTC", "Europe/London", "America/New_York", "Asia/Tokyo"];
  const valid = f.timezone && /^\d+(\.\d{1,4})?$/.test(f.riskLimitPercent);
  return (
    <Panel title="Preferences">
      {q.isLoading ? <LoadingBlock rows={2} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : (
        <div className="grid gap-5 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reporting timezone</Label>
            <Input list="tz" value={f.timezone} disabled={!canWrite} onChange={(e) => setF({ ...f, timezone: e.target.value })} data-testid="input-timezone" />
            <datalist id="tz">{zones.map((z) => <option key={z} value={z} />)}</datalist>
            <p className="text-[11px] text-muted-foreground">Times are stored in UTC. Browser timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Max risk per trade (% of balance)</Label>
            <Input value={f.riskLimitPercent} disabled={!canWrite} inputMode="decimal" onChange={(e) => setF({ ...f, riskLimitPercent: e.target.value.replace(/[^\d.]/g, "") })} className="num" data-testid="input-risk-limit" />
            <p className="text-[11px] text-muted-foreground">Used to flag trades on the Risk page. It never blocks logging.</p>
          </div>
          <div className="sm:col-span-2">
            {canWrite ? <Button disabled={!valid || upd.isPending} onClick={() => upd.mutate({ data: f }, { onSuccess: s.ok("Preferences saved"), onError: s.fail })} data-testid="button-save-settings">Save preferences</Button> : <WriteGate />}
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function SettingsPage() {
  const { demo } = useMode();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") ?? "accounts");
  return (
    <div>
      <PageHeader eyebrow={demo ? "Demo workspace · Settings" : "Settings"} title="Workspace" sub="Accounts, cash flows, the confluence vocabulary and reporting preferences." />
      <div className="flex gap-1 border-b border-border mb-5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("relative px-3 h-9 text-[13px] transition-colors", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")} data-testid={`tab-${t.id}`}>
            {t.label}{tab === t.id && <span className="absolute left-2 right-2 -bottom-px h-px bg-foreground" />}
          </button>
        ))}
      </div>
      {tab === "accounts" && <Accounts />}
      {tab === "confluences" && <ConfluenceManager />}
      {tab === "preferences" && <Preferences />}
    </div>
  );
}
