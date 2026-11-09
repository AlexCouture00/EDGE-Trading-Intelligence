import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function NSelect({ value, onChange, options, placeholder, className, testId, allowNone, noneLabel = "Any", disabled }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string; className?: string; testId?: string; allowNone?: boolean; noneLabel?: string; disabled?: boolean;
}) {
  return (
    <Select value={value === "" ? (allowNone ? NONE : undefined) : value} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger className={cn("h-8 text-[12.5px] bg-card", className)} data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value} disabled={o.disabled}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
