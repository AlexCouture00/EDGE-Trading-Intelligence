import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Check, Lock } from "lucide-react";
import {
  useCreateTrade, useUpdateTrade, useListConfluences, useListStrategies, useListAccounts, getGetTradeQueryKey,
  type Trade, type TradeInput, type TradeInputStatus, type TradeInputAssetClass, type TradeInputDirection, type TradeInputGrade, type TradeInputPnlSource,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { NSelect } from "@/components/nselect";
import { Caution } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { ASSET_CLASSES, errMsg, money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTimezone } from "@/lib/time";

type F = Record<string, string>;
const DEC = /^-?\d+(\.\d+)?$/;
const TEXT = ["symbol", "timeframe", "higherTimeframe", "session", "regime", "emotion", "thesis", "entryReason", "management", "exitReason", "wentWell", "wentWrong", "lesson", "chartUrl"] as const;
const NUMS = ["entryPrice", "exitPrice", "stopLoss", "takeProfit", "quantity", "multiplier", "initialRisk", "grossPnl"] as const;
const FEES = ["commission", "funding", "slippage"] as const;

function toLocal(iso?: string | null, timezone = "UTC") {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatInTimeZone(d, timezone, "yyyy-MM-dd'T'HH:mm");
}

function fromTrade(t?: Trade, timezone = "UTC"): F {
  const f: F = {};
  for (const k of TEXT) f[k] = (t?.[k] as string | undefined) ?? "";
  for (const k of NUMS) f[k] = (t?.[k] as string | null | undefined) ?? "";
  for (const k of FEES) f[k] = (t?.[k] as string | undefined) ?? "";
  f.accountId = t?.accountId ?? "";
  f.status = t?.status ?? "closed";
  f.assetClass = t?.assetClass ?? "";
  f.direction = t?.direction ?? "";
  f.pnlSource = t?.pnlSource ?? "broker";
  f.strategyId = t?.strategyId ?? "";
  f.grade = t?.grade ?? "";
  f.confidence = t?.confidence ? String(t.confidence) : "";
  f.entryAt = toLocal(t?.entryAt, timezone);
  f.exitAt = toLocal(t?.exitAt, timezone);
  f.behavioralTags = (t?.behavioralTags ?? []).join(", ");
  return f;
}

const SECTIONS = [
  { id: "basics", label: "Instrument" },
  { id: "execution", label: "Execution" },
  { id: "pnl", label: "P&L" },
  { id: "confluences", label: "Confluences" },
  { id: "context", label: "Context" },
  { id: "psychology", label: "Psychology" },
  { id: "review", label: "Review" },
];

function Field({ label, children, hint, className, error }: { label: string; children: ReactNode; hint?: ReactNode; className?: string; error?: string }) {
  return (
    <label className={cn("block space-y-1.5 min-w-0", className)}>
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="block text-[11px] text-neg">{error}</span> : hint ? <span className="block text-[11px] text-muted-foreground/80">{hint}</span> : null}
    </label>
  );
}

function Sec({ id, n, title, desc, children }: { id: string; n: number; title: string; desc?: string; children: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-20">
      <div className="px-5 py-3.5 border-b border-card-border flex items-baseline gap-3">
        <span className="num text-[11px] text-muted-foreground">0{n}</span>
        <h3 className="text-[13.5px] font-medium">{title}</h3>
        {desc && <span className="text-[11.5px] text-muted-foreground hidden sm:inline">{desc}</span>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function TradeEditor({ initial }: { initial?: Trade }) {
  const timezone = useTimezone();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const accounts = useListAccounts();
  const strategies = useListStrategies();
  const confluences = useListConfluences();
  const create = useCreateTrade();
  const update = useUpdateTrade();

  const [f, setF] = useState<F>(() => {
    const base = fromTrade(initial, timezone);
    if (!initial) {
      const first = (accounts.data ?? []).find((a) => !a.archived);
      if (first) base.accountId = first.id;
    }
    return base;
  });
  const previousTimezone = useRef(timezone);
  useEffect(() => {
    const before = previousTimezone.current;
    if (before !== timezone) {
      setF((state) => ({
        ...state,
        entryAt: state.entryAt ? toLocal(fromZonedTime(state.entryAt, before).toISOString(), timezone) : "",
        exitAt: state.exitAt ? toLocal(fromZonedTime(state.exitAt, before).toISOString(), timezone) : "",
      }));
      previousTimezone.current = timezone;
    }
  }, [timezone]);
  const [conf, setConf] = useState<string[]>(() => initial?.confluenceIds ?? initial?.confluences?.map((c) => c.id) ?? []);
  const [followedPlan, setFollowedPlan] = useState<boolean | undefined>(initial?.followedPlan);
  const [errors, setErrors] = useState<F>({});
  const set = (k: string, v: string) => { setF((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: "" })); };

  if (!initial && !f.accountId && accounts.data?.length) {
    const first = accounts.data.find((a) => !a.archived);
    if (first) setF((p) => ({ ...p, accountId: first.id }));
  }

  const riskLocked = !!initial && initial.status !== "draft";
  const account = accounts.data?.find((a) => a.id === f.accountId);
  const cur = account?.currency ?? "USD";

  const preview = useMemo(() => {
    const fees = FEES.reduce((s, k) => s + (num(f[k]) ?? 0), 0);
    let gross: number | null = null;
    if (f.pnlSource === "broker") gross = num(f.grossPnl);
    else {
      const e = num(f.entryPrice), x = num(f.exitPrice), q = num(f.quantity), m = num(f.multiplier);
      if (e !== null && x !== null && q !== null && m !== null && f.direction) gross = (f.direction === "long" ? x - e : e - x) * q * m;
    }
    const net = gross === null ? null : gross - fees;
    const risk = num(f.initialRisk);
    return { net, r: net !== null && risk ? net / risk : null, fees };
  }, [f]);

  function validate(status: string): F {
    const e: F = {};
    if (!f.accountId) e.accountId = "Choose an account";
    for (const k of [...NUMS, ...FEES]) if (f[k] && !DEC.test(f[k])) e[k] = "Number only";
    if (f.chartUrl && !/^https:\/\//.test(f.chartUrl)) e.chartUrl = "Must be a valid HTTPS URL";
    if (status !== "draft") {
      if (!f.symbol.trim()) e.symbol = "Required";
      if (!f.direction) e.direction = "Required";
      if (!f.entryAt) e.entryAt = "Required";
      if (!f.entryPrice || Number(f.entryPrice) <= 0) e.entryPrice = "Positive entry price required";
      if (!f.quantity || Number(f.quantity) <= 0) e.quantity = "Positive position size required";
    }
    if (status === "closed") {
      if (!f.exitAt) e.exitAt = "Required to close";
      else if (f.entryAt && new Date(f.exitAt) < new Date(f.entryAt)) e.exitAt = "Exit must be at or after entry";
      if (f.pnlSource === "broker") { if (!f.grossPnl) e.grossPnl = "Broker gross P&L required"; }
      else {
        for (const k of ["entryPrice", "exitPrice", "quantity", "multiplier"]) if (!f[k]) e[k] = "Required for calculated P&L";
      }
    }
    return e;
  }

  function build(status: TradeInputStatus): TradeInput {
    const iso = (v: string) => (v ? fromZonedTime(v, timezone).toISOString() : null);
    const d: TradeInput = { accountId: f.accountId, status };
    for (const k of TEXT) (d as unknown as Record<string, string>)[k] = k === "symbol" ? f.symbol.trim().toUpperCase() : f[k].trim();
    for (const k of NUMS) (d as unknown as Record<string, string | null>)[k] = f[k] ? f[k] : null;
    for (const k of FEES) (d as unknown as Record<string, string>)[k] = f[k] || "0";
    if (riskLocked) d.initialRisk = initial!.initialRisk;
    d.entryAt = iso(f.entryAt);
    d.exitAt = status === "closed" ? iso(f.exitAt) : (f.exitAt ? iso(f.exitAt) : null);
    if (f.assetClass) d.assetClass = f.assetClass as TradeInputAssetClass;
    if (f.direction) d.direction = f.direction as TradeInputDirection;
    d.pnlSource = f.pnlSource as TradeInputPnlSource;
    d.strategyId = f.strategyId || null;
    if (f.grade) d.grade = f.grade as TradeInputGrade;
    if (f.confidence) d.confidence = Number(f.confidence);
    if (followedPlan !== undefined) d.followedPlan = followedPlan;
    d.behavioralTags = f.behavioralTags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
    d.confluenceIds = conf;
    if (initial?.executions?.length) {
      if (initial.executions.length > 2 || initial.executions.filter((x) => x.kind === "entry").length > 1 || initial.executions.filter((x) => x.kind === "exit").length > 1) {
        // Multi-fill execution editing is a later workflow; reject contradictory summaries on the server.
        d.executions = initial.executions;
      } else {
        d.executions = [
          ...(d.entryAt && d.entryPrice && d.quantity ? [{ kind: "entry" as const, timestamp: d.entryAt, price: d.entryPrice, quantity: d.quantity, fee: initial.executions.find((x) => x.kind === "entry")?.fee ?? "0" }] : []),
          ...(status === "closed" && d.exitAt && d.exitPrice && d.quantity ? [{ kind: "exit" as const, timestamp: d.exitAt, price: d.exitPrice, quantity: d.quantity, fee: initial.executions.find((x) => x.kind === "exit")?.fee ?? "0" }] : []),
        ];
      }
    }
    return d;
  }

  function submit(status: TradeInputStatus) {
    const e = validate(status);
    if (Object.values(e).some(Boolean)) {
      setErrors(e);
      toast({ title: "A few fields need attention", description: Object.keys(e).length + " issue(s) highlighted below." });
      return;
    }
    const data = build(status);
    const done = async (t: Trade) => {
      const detailKey = getGetTradeQueryKey(t.id);
      // An older detail fetch must not overwrite the authoritative mutation result.
      await qc.cancelQueries({ queryKey: detailKey });
      qc.setQueryData(detailKey, t);
      void qc.invalidateQueries();
      toast({ title: initial ? "Trade updated" : status === "draft" ? "Draft saved" : "Trade logged" });
      nav(`/trades/${t.id}`);
    };
    const fail = (err: unknown) => toast({ title: "Save failed", description: errMsg(err), variant: "destructive" });
    if (initial) update.mutate({ id: initial.id, data }, { onSuccess: done, onError: fail });
    else create.mutate({ data }, { onSuccess: done, onError: fail });
  }

  const pending = create.isPending || update.isPending;
  const activeConf = (confluences.data ?? []).filter((c) => !c.archived && (c.enabled !== false || conf.includes(c.id))).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const inp = "h-9 bg-background/60";
  const status = f.status;

  return (
    <div className="grid gap-6 lg:grid-cols-[170px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-0.5">
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }); }} className="flex items-center gap-2.5 px-2 h-7 rounded text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
              <span className="num text-[10px] opacity-60">0{i + 1}</span>{s.label}
            </a>
          ))}
          <div className="mt-6 panel p-3 space-y-2">
            <div className="eyebrow">Preview</div>
            <div className={cn("num text-lg", preview.net === null ? "text-muted-foreground" : preview.net >= 0 ? "text-pos" : "text-neg")}>{preview.net === null ? "—" : money(preview.net, cur, { signed: true })}</div>
            <div className="num text-[12px] text-muted-foreground">{preview.r === null ? "R unavailable" : `${preview.r >= 0 ? "+" : ""}${preview.r.toFixed(2)}R`}</div>
            <div className="text-[10.5px] text-muted-foreground leading-snug">Estimate only. Server computes stored values.</div>
          </div>
        </div>
      </aside>

      <div className="space-y-4 pb-28 min-w-0">
        <div className="panel p-1 grid grid-cols-3 max-w-md text-[12.5px]" data-testid="toggle-status">
          {(["draft", "open", "closed"] as const).map((s) => (
            <button key={s} type="button" onClick={() => set("status", s)} className={cn("h-8 rounded-[4px] capitalize transition-colors", status === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")} data-testid={`button-status-${s}`}>{s}</button>
          ))}
        </div>

        <Sec id="basics" n={1} title="Instrument" desc="What and where">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Field label="Account" className="col-span-2" error={errors.accountId}>
              <NSelect value={f.accountId} onChange={(v) => set("accountId", v)} className={inp} testId="select-trade-account" placeholder="Account"
                options={(accounts.data ?? []).filter((a) => !a.archived || a.id === f.accountId).map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))} />
            </Field>
            <Field label="Strategy" className="col-span-2">
              <NSelect value={f.strategyId} onChange={(v) => set("strategyId", v)} allowNone noneLabel="No strategy" className={inp} testId="select-trade-strategy"
                options={(strategies.data ?? []).filter((s) => !s.archived || s.id === f.strategyId).map((s) => ({ value: s.id, label: s.name }))} />
            </Field>
            <Field label="Symbol" error={errors.symbol}><Input value={f.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="XAUUSD" className={cn(inp, "num uppercase")} data-testid="input-symbol" /></Field>
            <Field label="Asset class">
              <NSelect value={f.assetClass} onChange={(v) => set("assetClass", v)} allowNone noneLabel="Unspecified" className={inp} testId="select-asset-class" options={ASSET_CLASSES.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))} />
            </Field>
            <Field label="Direction" className="col-span-2" error={errors.direction}>
              <div className="grid grid-cols-2 gap-2">
                {(["long", "short"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => set("direction", d)} className={cn("h-9 rounded-md border text-[13px] capitalize transition-colors", f.direction === d ? (d === "long" ? "border-[hsl(var(--pos)/.5)] bg-[hsl(var(--pos)/.08)] text-pos" : "border-[hsl(var(--neg)/.5)] bg-[hsl(var(--neg)/.08)] text-neg") : "border-input text-muted-foreground hover:text-foreground")} data-testid={`button-direction-${d}`}>{d}</button>
                ))}
              </div>
            </Field>
          </div>
        </Sec>

        <Sec id="execution" n={2} title="Execution" desc={`Times in ${timezone}, stored as UTC`}>
          {(initial?.executions?.length ?? 0) > 2 && <Caution>Multiple recorded fills determine execution prices and quantity. This form edits the review and costs; individual-fill editing is not available yet.</Caution>}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Field label="Entry time" className="col-span-2" error={errors.entryAt}><Input type="datetime-local" value={f.entryAt} onChange={(e) => set("entryAt", e.target.value)} className={cn(inp, "num")} data-testid="input-entry-at" /></Field>
            <Field label={status === "closed" ? "Exit time" : "Exit time (when closed)"} className="col-span-2" error={errors.exitAt}><Input type="datetime-local" value={f.exitAt} onChange={(e) => set("exitAt", e.target.value)} disabled={status !== "closed"} className={cn(inp, "num")} data-testid="input-exit-at" /></Field>
            <Field label="Entry price" error={errors.entryPrice}><Input value={f.entryPrice} inputMode="decimal" onChange={(e) => set("entryPrice", e.target.value)} className={cn(inp, "num")} data-testid="input-entry-price" /></Field>
            <Field label="Exit price" error={errors.exitPrice}><Input value={f.exitPrice} inputMode="decimal" onChange={(e) => set("exitPrice", e.target.value)} className={cn(inp, "num")} data-testid="input-exit-price" /></Field>
            <Field label="Stop loss" error={errors.stopLoss}><Input value={f.stopLoss} inputMode="decimal" onChange={(e) => set("stopLoss", e.target.value)} className={cn(inp, "num")} data-testid="input-stop-loss" /></Field>
            <Field label="Take profit" error={errors.takeProfit}><Input value={f.takeProfit} inputMode="decimal" onChange={(e) => set("takeProfit", e.target.value)} className={cn(inp, "num")} data-testid="input-take-profit" /></Field>
            <Field label="Quantity" error={errors.quantity}><Input value={f.quantity} inputMode="decimal" onChange={(e) => set("quantity", e.target.value)} placeholder="lots / units" className={cn(inp, "num")} data-testid="input-quantity" /></Field>
            <Field label="Multiplier" error={errors.multiplier} hint="Account currency per 1.0 price move per unit"><Input value={f.multiplier} inputMode="decimal" onChange={(e) => set("multiplier", e.target.value)} className={cn(inp, "num")} data-testid="input-multiplier" /></Field>
            <Field label={`Initial risk (${cur})`} className="col-span-2" error={errors.initialRisk}
              hint={riskLocked ? "Locked after the trade first left draft, so R stays honest." : "Amount you stood to lose at the stop. Locked once the trade is open or closed."}>
              <div className="relative">
                <Input value={f.initialRisk} inputMode="decimal" disabled={riskLocked} onChange={(e) => set("initialRisk", e.target.value)} className={cn(inp, "num pr-8")} data-testid="input-initial-risk" />
                {riskLocked && <Lock className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
              </div>
            </Field>
          </div>
          {initial?.executions && initial.executions.length > 0 && (
            <div className="mt-5 border-t border-card-border pt-4">
              <div className="eyebrow mb-2">Recorded executions (preserved)</div>
              <div className="text-[12px] num text-muted-foreground space-y-1">
                {initial.executions.map((x, i) => <div key={i}>{x.kind.toUpperCase()} {x.quantity} @ {x.price} · {toLocal(x.timestamp, timezone).replace("T", " ")}</div>)}
              </div>
            </div>
          )}
        </Sec>

        <Sec id="pnl" n={3} title="P&L" desc="Broker figures or linear calculation">
          <div className="grid grid-cols-2 gap-2 max-w-md mb-4">
            {(["broker", "calculated"] as const).map((s) => (
              <button key={s} type="button" onClick={() => set("pnlSource", s)} className={cn("rounded-md border px-3 py-2 text-left transition-colors", f.pnlSource === s ? "border-foreground/40 bg-secondary" : "border-input hover:border-foreground/20")} data-testid={`button-pnl-${s}`}>
                <div className="text-[12.5px] font-medium">{s === "broker" ? "Broker gross P&L" : "Calculated (linear)"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s === "broker" ? "Any instrument. Copy from statement." : "Requires prices, qty and explicit multiplier."}</div>
              </button>
            ))}
          </div>
          {f.pnlSource === "calculated" && <div className="mb-4"><Caution>Calculated mode assumes a linear instrument quoted so that price move x quantity x multiplier lands in {cur}. For cross-currency pairs or unknown contract specs, use broker mode.</Caution></div>}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Field label={`Gross P&L (${cur})`} error={errors.grossPnl}><Input value={f.grossPnl} inputMode="decimal" disabled={f.pnlSource !== "broker"} onChange={(e) => set("grossPnl", e.target.value)} placeholder={f.pnlSource === "broker" ? "-182.40" : "computed"} className={cn(inp, "num")} data-testid="input-gross-pnl" /></Field>
            <Field label="Commission" error={errors.commission}><Input value={f.commission} inputMode="decimal" onChange={(e) => set("commission", e.target.value)} placeholder="0" className={cn(inp, "num")} data-testid="input-commission" /></Field>
            <Field label="Swap / funding" error={errors.funding}><Input value={f.funding} inputMode="decimal" onChange={(e) => set("funding", e.target.value)} placeholder="0" className={cn(inp, "num")} data-testid="input-funding" /></Field>
            <Field label="Slippage" error={errors.slippage}><Input value={f.slippage} inputMode="decimal" onChange={(e) => set("slippage", e.target.value)} placeholder="0" className={cn(inp, "num")} data-testid="input-slippage" /></Field>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Costs are entered as positive amounts and subtracted from gross.</p>
        </Sec>

        <Sec id="confluences" n={4} title="Confluences" desc={`${conf.length} selected`}>
          {confluences.isLoading ? <div className="text-sm text-muted-foreground">Loading...</div> : activeConf.length === 0 ? (
            <div className="text-sm text-muted-foreground">No enabled confluences. Add them in Settings.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeConf.map((c) => {
                const on = conf.includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => setConf((p) => on ? p.filter((x) => x !== c.id) : [...p, c.id])}
                    className={cn("inline-flex items-center gap-2 rounded-md border px-2.5 h-8 text-[12.5px] transition-all active:scale-[.97]", on ? "border-foreground/35 bg-secondary text-foreground" : "border-input text-muted-foreground hover:text-foreground")}
                    data-testid={`button-confluence-${c.id}`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color ?? "#888", opacity: on ? 1 : 0.5 }} />
                    {c.name}
                    {on && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </Sec>

        <Sec id="context" n={5} title="Market context">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Field label="Execution TF"><Input value={f.timeframe} onChange={(e) => set("timeframe", e.target.value)} placeholder="H1" className={inp} data-testid="input-timeframe" /></Field>
            <Field label="Higher TF"><Input value={f.higherTimeframe} onChange={(e) => set("higherTimeframe", e.target.value)} placeholder="D1" className={inp} data-testid="input-htf" /></Field>
            <Field label="Session"><Input value={f.session} onChange={(e) => set("session", e.target.value)} placeholder="London" list="sessions" className={inp} data-testid="input-session" /></Field>
            <Field label="Regime"><Input value={f.regime} onChange={(e) => set("regime", e.target.value)} placeholder="Trending" list="regimes" className={inp} data-testid="input-regime" /></Field>
            <datalist id="sessions"><option value="Asia" /><option value="London" /><option value="New York" /><option value="London/NY overlap" /></datalist>
            <datalist id="regimes"><option value="Trending" /><option value="Ranging" /><option value="High volatility" /><option value="News-driven" /></datalist>
          </div>
        </Sec>

        <Sec id="psychology" n={6} title="Psychology">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Field label="Dominant emotion"><Input value={f.emotion} onChange={(e) => set("emotion", e.target.value)} placeholder="Calm" list="emotions" className={inp} data-testid="input-emotion" /></Field>
            <datalist id="emotions"><option value="Calm" /><option value="Confident" /><option value="Anxious" /><option value="Impatient" /><option value="Frustrated" /><option value="Euphoric" /></datalist>
            <Field label="Confidence (1-5)">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => set("confidence", f.confidence === String(n) ? "" : String(n))} className={cn("h-9 flex-1 rounded-md border num text-[12.5px] transition-colors", Number(f.confidence) >= n ? "border-foreground/30 bg-secondary text-foreground" : "border-input text-muted-foreground")} data-testid={`button-confidence-${n}`}>{n}</button>
                ))}
              </div>
            </Field>
            <Field label="Execution grade">
              <div className="flex gap-1">
                {(["A", "B", "C", "D", "F"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => set("grade", f.grade === g ? "" : g)} className={cn("h-9 flex-1 rounded-md border num text-[12.5px] transition-colors", f.grade === g ? "border-foreground/30 bg-secondary text-foreground" : "border-input text-muted-foreground")} data-testid={`button-grade-${g}`}>{g}</button>
                ))}
              </div>
            </Field>
            <Field label="Followed plan">
              <div className="h-9 flex items-center gap-3">
                <Switch checked={followedPlan === true} onCheckedChange={(v) => setFollowedPlan(v)} data-testid="switch-followed-plan" />
                <span className="text-[12.5px] text-muted-foreground">{followedPlan === undefined ? "Not recorded" : followedPlan ? "Yes" : "No"}</span>
              </div>
            </Field>
            <Field label="Behavioral tags" className="col-span-2 md:col-span-4" hint="Comma separated, e.g. moved stop, early exit, revenge, FOMO entry">
              <Input value={f.behavioralTags} onChange={(e) => set("behavioralTags", e.target.value)} className={inp} data-testid="input-behavioral-tags" />
            </Field>
          </div>
        </Sec>

        <Sec id="review" n={7} title="Review" desc="Write it while it is fresh">
          <div className="grid gap-4 md:grid-cols-2">
            {([["thesis", "Thesis"], ["entryReason", "Entry reason"], ["management", "Management"], ["exitReason", "Exit reason"], ["wentWell", "What went well"], ["wentWrong", "What went wrong"]] as const).map(([k, l]) => (
              <Field key={k} label={l}><Textarea rows={3} value={f[k]} onChange={(e) => set(k, e.target.value)} className="bg-background/60 text-[13px]" data-testid={`input-${k}`} /></Field>
            ))}
            <Field label="Lesson" className="md:col-span-2"><Textarea rows={2} value={f.lesson} onChange={(e) => set("lesson", e.target.value)} className="bg-background/60 text-[13px]" data-testid="input-lesson" /></Field>
            <Field label="Chart URL" className="md:col-span-2" error={errors.chartUrl} hint="TradingView snapshot or any external link. Uploads are not supported yet."><Input value={f.chartUrl} onChange={(e) => set("chartUrl", e.target.value)} placeholder="https://www.tradingview.com/x/..." className={inp} data-testid="input-chart-url" /></Field>
          </div>
        </Sec>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-[232px] z-20 border-t border-border bg-background/90 backdrop-blur">
        <div className="max-w-[1440px] px-4 md:px-8 h-14 flex items-center gap-3">
          <span className="text-[12px] text-muted-foreground hidden sm:block">Saving as <span className="text-foreground capitalize">{status}</span>{preview.net !== null && <> · est. <span className={preview.net >= 0 ? "text-pos" : "text-neg"}>{money(preview.net, cur, { signed: true })}</span></>}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => (initial ? nav(`/trades/${initial.id}`) : nav("/journal"))} data-testid="button-cancel">Cancel</Button>
            {status !== "draft" && !initial && <Button variant="outline" disabled={pending} onClick={() => submit("draft")} data-testid="button-save-draft">Save as draft</Button>}
            <Button disabled={pending} onClick={() => submit(status as TradeInputStatus)} data-testid="button-save-trade">{pending ? "Saving..." : initial ? "Save changes" : status === "draft" ? "Save draft" : status === "open" ? "Log open trade" : "Log closed trade"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
