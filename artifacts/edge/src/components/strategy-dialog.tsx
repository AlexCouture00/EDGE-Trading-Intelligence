import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateStrategy, useUpdateStrategy, type Strategy } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";

export function StrategyDialog({ open, onOpenChange, strategy }: { open: boolean; onOpenChange: (v: boolean) => void; strategy?: Strategy }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateStrategy();
  const update = useUpdateStrategy();
  const blank = { name: "", description: "", entryRules: "", exitRules: "", riskRules: "", timeframe: "" };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (open) setF(strategy ? { name: strategy.name, description: strategy.description ?? "", entryRules: strategy.entryRules ?? "", exitRules: strategy.exitRules ?? "", riskRules: strategy.riskRules ?? "", timeframe: strategy.timeframe ?? "" } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, strategy]);

  const save = () => {
    if (!f.name.trim()) return;
    const data = { ...f, name: f.name.trim(), archived: strategy?.archived ?? false };
    const opts = {
      onSuccess: () => { void qc.invalidateQueries(); toast({ title: strategy ? "Strategy updated" : "Strategy created" }); onOpenChange(false); },
      onError: (e: unknown) => toast({ title: "Save failed", description: errMsg(e), variant: "destructive" }),
    };
    if (strategy) update.mutate({ id: strategy.id, data }, opts); else create.mutate({ data }, opts);
  };

  const area = (k: keyof typeof f, label: string, ph: string) => (
    <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label><Textarea rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} className="text-[13px]" data-testid={`input-strategy-${k}`} /></div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{strategy ? "Edit strategy" : "New strategy"}</DialogTitle>
          <DialogDescription>These rules become the playbook. Write them so a stranger could follow them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-strategy-name" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Timeframe</Label><Input value={f.timeframe} onChange={(e) => setF({ ...f, timeframe: e.target.value })} placeholder="H4" data-testid="input-strategy-timeframe" /></div>
          </div>
          {area("description", "Description", "When this works and why you trade it.")}
          {area("entryRules", "Entry rules", "One rule per line.")}
          {area("exitRules", "Exit rules", "Targets, trailing, time stops.")}
          {area("riskRules", "Risk rules", "Max risk per trade, invalidation, no-trade conditions.")}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!f.name.trim() || create.isPending || update.isPending} data-testid="button-save-strategy">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
