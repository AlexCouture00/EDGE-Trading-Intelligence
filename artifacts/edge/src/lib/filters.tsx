import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { subDays, startOfYear, subMonths } from "date-fns";
import { useListAccounts, useListStrategies, type Account, type Strategy, type GetAnalyticsParams, type ListTradesParams } from "@workspace/api-client-react";
import { useMode } from "./mode";

export type Range = "all" | "30d" | "90d" | "ytd" | "12m";
export type Filters = { currency: string; range: Range; symbol: string; strategyId: string; direction: "" | "long" | "short" };

const initial: Filters = { currency: "", range: "all", symbol: "", strategyId: "", direction: "" };

type Ctx = {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  reset: () => void;
  accounts: Account[];
  activeAccounts: Account[];
  strategies: Strategy[];
  accountsLoading: boolean;
  accountsError: unknown;
  refetchAccounts: () => void;
  mixedCurrency: boolean;
  currencies: string[];
  currency: string;
  scopeLabel: string;
  analyticsParams: GetAnalyticsParams;
  tradeParams: ListTradesParams;
};

const C = createContext<Ctx | null>(null);

function rangeFrom(r: Range): string | undefined {
  const now = new Date();
  if (r === "30d") return subDays(now, 30).toISOString();
  if (r === "90d") return subDays(now, 90).toISOString();
  if (r === "ytd") return startOfYear(now).toISOString();
  if (r === "12m") return subMonths(now, 12).toISOString();
  return undefined;
}

export const RANGE_LABEL: Record<Range, string> = { all: "All time", "30d": "30 days", "90d": "90 days", ytd: "Year to date", "12m": "12 months" };

export function FiltersProvider({ children }: { children: ReactNode }) {
  const { dp, demo } = useMode();
  const [filters, setFilters] = useState<Filters>(initial);
  const acc = useListAccounts(dp);
  const strat = useListStrategies(dp);

  useEffect(() => { setFilters(initial); }, [demo]);

  const accounts = acc.data ?? [];
  const activeAccounts = accounts.filter((a) => !a.archived);
  const currencies = Array.from(new Set(accounts.map((a) => a.currency)));
  const mixedCurrency = currencies.length > 1;

  const currency = currencies.includes(filters.currency) ? filters.currency
    : currencies.includes("USD") ? "USD" : currencies[0] ?? "USD";

  const value = useMemo<Ctx>(() => {
    const from = rangeFrom(filters.range);
    const base = {
      ...(dp ?? {}),
      currency,
      ...(from ? { from } : {}),
      ...(filters.symbol ? { symbol: filters.symbol.toUpperCase() } : {}),
      ...(filters.strategyId ? { strategyId: filters.strategyId } : {}),
      ...(filters.direction ? { direction: filters.direction } : {}),
    };
    return {
      filters,
      set: (p) => setFilters((f) => ({ ...f, ...p })),
      reset: () => setFilters(initial),
      accounts,
      activeAccounts,
      strategies: strat.data ?? [],
      accountsLoading: acc.isLoading,
      accountsError: acc.error,
      refetchAccounts: () => { void acc.refetch(); },
      mixedCurrency,
      currencies,
      currency,
      scopeLabel: `All trades · ${currency}`,
      analyticsParams: base,
      tradeParams: base,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, dp, acc.data, acc.isLoading, acc.error, strat.data, mixedCurrency, currency]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useFilters() {
  const c = useContext(C);
  if (!c) throw new Error("useFilters outside provider");
  return c;
}
