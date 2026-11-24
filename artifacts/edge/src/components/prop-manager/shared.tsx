import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPropManagerQueryKey, useCreatePropRecord, useDeletePropRecord, useGetPropManager, useUpdatePropRecord,
  type PropRecordInput,
} from "@workspace/api-client-react";
import type { Portfolio } from "@workspace/prop-math";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Kind = "firms" | "accounts" | "balances" | "challenges" | "rules" | "expenses" | "payouts";

export const MARKETS = ["CFD", "Futures", "Perpetuals"] as const;
export const ACCOUNT_STATUS: Record<string, string> = {
  not_started: "Not started", evaluation: "Evaluation", funded: "Funded", passed: "Passed",
  failed: "Failed / breached", expired: "Expired", closed: "Closed", archived: "Archived",
};
export const STRUCTURES: Record<string, string> = {
  one_step: "One-step", two_step: "Two-step", multi_step: "Multi-step", instant_funded: "Instant funded", custom: "Custom",
};
export const CHALLENGE_STATUS: Record<string, string> = { not_started: "Not started", active: "Active", passed: "Passed", failed: "Failed", expired: "Expired" };
export const RULE_CATEGORY: Record<string, string> = { risk: "Risk", trading: "Trading restriction", payout: "Payout" };
export const RULE_METHOD: Record<string, string> = {
  static_balance_loss: "Static drawdown (balance)", trailing_balance_loss: "Trailing drawdown (balance)", daily_loss: "Maximum daily loss",
  eod_trailing: "End-of-day trailing drawdown", intraday_trailing: "Intraday trailing drawdown", equity_loss: "Equity-based drawdown",
  max_position_size: "Maximum position size", max_contract_size: "Maximum contract size", news: "News trading",
  weekend: "Weekend holding", overnight: "Overnight holding", minimum_days: "Minimum trading days", maximum_days: "Maximum trading days",
  consistency: "Consistency rule", maximum_daily_profit: "Maximum daily profit %", restricted_instruments: "Restricted instruments",
  restricted_hours: "Restricted trading hours", minimum_payout: "Minimum payout", profit_split: "Profit split",
  payout_frequency: "Payout frequency", minimum_profitable_days: "Minimum profitable days", payout_eligibility: "Payout eligibility",
  payout_cap: "Maximum payout cap", buffer: "Buffer requirement", custom: "Custom",
};
export const EXPENSE_CATEGORY: Record<string, string> = {
  challenge_purchase: "Challenge purchase", challenge_reset: "Challenge reset", activation: "Activation fee",
  subscription: "Monthly subscription", platform: "Platform fee", data: "Data fee", withdrawal: "Withdrawal fee", other: "Other",
};
export const PAYOUT_STATUS: Record<string, string> = { requested: "Requested", approved: "Approved", paid: "Paid", rejected: "Rejected", cancelled: "Cancelled" };

export const MONEY_RE = /^-?\d{1,16}(\.\d{1,8})?$/;
export const UMONEY_RE = /^\d{1,16}(\.\d{1,8})?$/;
export const today = () => new Date().toISOString().slice(0, 10);
export const nn = (s: string) => (s.trim() === "" ? null : s.trim());

export function usePortfolio() {
  return useGetPropManager({ query: { queryKey: getGetPropManagerQueryKey(), staleTime: 20_000, refetchOnWindowFocus: true } });
}
export const asPortfolio = (p: unknown) => p as Portfolio;

export function usePropMutations() {
  const qc = useQueryClient();
  const create = useCreatePropRecord();
  const update = useUpdatePropRecord();
  const del = useDeletePropRecord();
  const refresh = () => qc.invalidateQueries({ queryKey: getGetPropManagerQueryKey() });
  return {
    save: async (kind: Kind, id: string | null, data: PropRecordInput) => {
      try {
        if (id) await update.mutateAsync({ kind, id, data });
        else await create.mutateAsync({ kind, data });
      } finally { await refresh(); }
    },
    remove: async (kind: Kind, id: string) => {
      try { await del.mutateAsync({ kind, id }); } finally { await refresh(); }
    },
  };
}

export function isMigrationNeeded(e: unknown) {
  return typeof e === "object" && e !== null && (e as { status?: number }).status === 503;
}
export function propErr(e: unknown) {
  if (isMigrationNeeded(e)) return "The Prop Firm Manager storage is not installed yet (database migration pending). Your draft is kept; try again after the migration is applied.";
  return errMsg(e);
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "pos" | "neg" | "signal" | "caution" }) {
  const cls = {
    muted: "text-muted-foreground border-border", pos: "text-pos border-[hsl(var(--pos)/.35)]", neg: "text-neg border-[hsl(var(--neg)/.35)]",
    signal: "text-signal border-[hsl(var(--signal)/.35)]", caution: "text-caution border-[hsl(var(--caution)/.35)]",
  }[tone];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-px text-[10px] font-mono uppercase tracking-wider", cls)}>{children}</span>;
}
export const statusTone = (s: string): "pos" | "neg" | "signal" | "caution" | "muted" =>
  s === "funded" || s === "passed" || s === "paid" ? "pos" : s === "failed" || s === "rejected" ? "neg"
    : s === "evaluation" || s === "active" || s === "approved" ? "signal" : s === "requested" ? "caution" : "muted";

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
export function TextIn({ value, onChange, testId, ...rest }: { value: string; onChange: (v: string) => void; testId: string; placeholder?: string; type?: string; max?: string; disabled?: boolean; inputMode?: "decimal" | "numeric" | "text" | "url" }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="h-9 bg-background" {...rest} />;
}
export function MoneyIn(p: { value: string; onChange: (v: string) => void; testId: string; placeholder?: string; disabled?: boolean }) {
  return <TextIn {...p} inputMode="decimal" placeholder={p.placeholder ?? "0.00"} />;
}
export function TextArea({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  return <Textarea value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="bg-background min-h-[72px]" />;
}
export function Sel({ value, onChange, options, testId, disabled, placeholder }: { value: string; onChange: (v: string) => void; options: [string, string][]; testId: string; disabled?: boolean; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 bg-background" data-testid={testId}><SelectValue placeholder={placeholder ?? "Select"} /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Dialog that owns a draft, keeps it on failed saves and warns before discarding edits. */
export function EditorDialog<T>({ open, onClose, title, description, initial, validate, onSubmit, children, submitLabel = "Save" }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; initial: T;
  validate?: (d: T) => string | null; onSubmit: (d: T) => Promise<void>;
  children: (d: T, set: <K extends keyof T>(k: K, v: T[K]) => void) => ReactNode; submitLabel?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const busyRef = useRef(false);
  const set = <K extends keyof T>(k: K, v: T[K]) => { if (!busyRef.current) setDraft((d) => ({ ...d, [k]: v })); };
  const guard = dirty || busy;
  useEffect(() => {
    if (!open || !guard) return;
    const msg = "Discard unsaved changes?";
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (a && !window.confirm(msg)) { e.preventDefault(); e.stopPropagation(); }
    };
    let here = window.location.href;
    const pop = () => {
      if (!window.confirm(msg)) window.history.pushState(null, "", here);
      else here = window.location.href;
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); window.removeEventListener("popstate", pop); };
  }, [open, guard]);
  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };
  const submit = async () => {
    if (busyRef.current) return;
    const v = validate?.(draft) ?? null;
    if (v) { setError(v); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try { await onSubmit(draft); onClose(); } catch (e) { setError(propErr(e)); /* draft kept */ } finally { busyRef.current = false; setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto bg-card border-card-border">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-medium tracking-tight">{title}</DialogTitle>
          {description && <DialogDescription className="text-[12.5px]">{description}</DialogDescription>}
        </DialogHeader>
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <fieldset disabled={busy} className="contents">{children(draft, set)}</fieldset>
          {error && <div className="sm:col-span-2 rounded-md border border-[hsl(var(--neg)/.35)] bg-[hsl(var(--neg)/.06)] px-3 py-2 text-[12.5px] text-neg" data-testid="text-form-error">{error}</div>}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={close} data-testid="button-cancel">Cancel</Button>
            <Button type="submit" size="sm" disabled={busy} data-testid="button-save">{busy ? "Saving" : submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDelete({ open, onClose, what, onConfirm }: { open: boolean; onClose: () => void; what: string; onConfirm: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !busy) { setError(null); onClose(); } }}>
      <AlertDialogContent className="bg-card border-card-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {what}?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the record and every total that depends on it. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <div className="text-[12.5px] text-neg">{error}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">Keep</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground" disabled={busy} data-testid="button-confirm-delete"
            onClick={(e) => { e.preventDefault(); setBusy(true); onConfirm().then(onClose, (x) => setError(propErr(x))).finally(() => setBusy(false)); }}>
            {busy ? "Deleting" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return <div className="h-[220px] grid-bg rounded-md flex items-center justify-center text-center px-6 text-[12.5px] text-muted-foreground">{children}</div>;
}
export const axisTick = { fill: "hsl(220 5% 56%)", fontSize: 11, fontFamily: "Geist Mono, monospace" };
export const tipStyle = { background: "hsl(220 7% 10%)", border: "1px solid hsl(220 6% 18%)", borderRadius: 6, fontSize: 12 };
