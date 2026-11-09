import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { NSelect } from "@/components/nselect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RANGE_LABEL, useFilters, type Range } from "@/lib/filters";

export function FilterBar({ hideRange }: { hideRange?: boolean }) {
  const { filters, set, reset, activeAccounts, strategies, mixedCurrency } = useFilters();
  const [sym, setSym] = useState(filters.symbol);
  useEffect(() => setSym(filters.symbol), [filters.symbol]);
  useEffect(() => {
    const t = setTimeout(() => { if (sym !== filters.symbol) set({ symbol: sym }); }, 350);
    return () => clearTimeout(t);
  }, [sym, filters.symbol, set]);

  const dirty = filters.range !== "all" || filters.symbol || filters.strategyId || filters.direction || (!mixedCurrency && filters.accountId);

  return (
    <div className="flex flex-wrap items-center gap-2 pb-5 rise" data-testid="filter-bar">
      <NSelect
        value={filters.accountId}
        onChange={(v) => set({ accountId: v })}
        allowNone={!mixedCurrency}
        noneLabel="All accounts"
        placeholder="Account"
        className="w-[190px]"
        testId="select-account"
        options={activeAccounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
      />
      {!hideRange && (
        <NSelect value={filters.range} onChange={(v) => set({ range: v as Range })} className="w-[130px]" testId="select-range"
          options={(Object.keys(RANGE_LABEL) as Range[]).map((k) => ({ value: k, label: RANGE_LABEL[k] }))} />
      )}
      <NSelect value={filters.strategyId} onChange={(v) => set({ strategyId: v })} allowNone noneLabel="All strategies" placeholder="Strategy" className="w-[160px]" testId="select-strategy"
        options={strategies.filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name }))} />
      <NSelect value={filters.direction} onChange={(v) => set({ direction: v as "" | "long" | "short" })} allowNone noneLabel="Both sides" className="w-[118px]" testId="select-direction"
        options={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]} />
      <Input value={sym} onChange={(e) => setSym(e.target.value)} placeholder="Symbol" className="h-8 w-[110px] text-[12.5px] bg-card uppercase placeholder:normal-case" data-testid="input-symbol-filter" />
      {dirty && (
        <Button size="sm" variant="ghost" onClick={reset} className="text-muted-foreground" data-testid="button-reset-filters">
          <X className="h-3.5 w-3.5 mr-1" /> Reset
        </Button>
      )}
      {mixedCurrency && <span className="text-[11px] text-muted-foreground ml-1">Accounts use different currencies — results are scoped to one account.</span>}
    </div>
  );
}
