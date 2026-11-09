import { format } from "date-fns";
import type { Metrics } from "@workspace/api-client-react";

export const DASH = "—";

export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function money(v: string | number | null | undefined, currency = "USD", opts: { signed?: boolean; compact?: boolean } = {}): string {
  const n = num(v);
  if (n === null) return DASH;
  let s: string;
  try {
    s = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
    }).format(Math.abs(n));
  } catch {
    s = `${Math.abs(n).toFixed(2)} ${currency}`;
  }
  if (n < 0) return `-${s}`;
  return opts.signed && n > 0 ? `+${s}` : s;
}

/** API win-rate/adherence values are percentage points, 0..100. */
export function ratio(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${v.toFixed(digits)}%`;
}

export function pctRaw(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${v.toFixed(digits)}%`;
}

export function rFmt(v: string | number | null | undefined, digits = 2): string {
  const n = num(v);
  if (n === null) return DASH;
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}R`;
}

export function pf(m: Pick<Metrics, "profitFactor" | "profitFactorInfinite">): string {
  if (m.profitFactorInfinite) return "∞";
  if (m.profitFactor === null || m.profitFactor === undefined) return DASH;
  return m.profitFactor.toFixed(2);
}

export function tone(v: string | number | null | undefined): string {
  const n = num(v);
  if (n === null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-pos" : "text-neg";
}

export function dt(iso: string | null | undefined, f = "dd MMM yy, HH:mm"): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return format(d, f);
}

export function hours(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  if (v < 24) return `${v.toFixed(1)}h`;
  return `${(v / 24).toFixed(1)}d`;
}

export function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export const ACCOUNT_TYPES: Record<string, string> = {
  personal_live: "Personal live",
  demo: "Broker demo",
  prop_evaluation: "Prop evaluation",
  prop_funded: "Prop funded",
  backtesting: "Backtesting",
};

export const ASSET_CLASSES = ["forex", "metals", "indices", "crypto", "futures", "stocks"] as const;
