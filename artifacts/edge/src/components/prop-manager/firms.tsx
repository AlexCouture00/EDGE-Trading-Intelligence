import { useState } from "react";
import { Building2, Pencil, Plus } from "lucide-react";
import type { PropFirm, PropFirmInput } from "@workspace/api-client-react";
import type { Portfolio } from "@workspace/prop-math";
import { Empty, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { EditorDialog, Field, MARKETS, Pill, Sel, TextArea, TextIn, usePropMutations } from "./shared";

const blank: PropFirmInput = { name: "", website: "", marketType: "CFD", platform: "", notes: "", status: "active" };

export function Firms({ p }: { p: Portfolio }) {
  const { save } = usePropMutations();
  const [editing, setEditing] = useState<PropFirm | "new" | null>(null);
  const initial: PropFirmInput = editing && editing !== "new"
    ? { name: editing.name, website: editing.website, marketType: editing.marketType, platform: editing.platform, notes: editing.notes, status: editing.status } : blank;
  return (
    <Panel title="Prop firms" meta={`${p.firms.length} recorded`} bodyClass="p-0"
      actions={<Button size="sm" onClick={() => setEditing("new")} data-testid="button-add-firm"><Plus className="h-3.5 w-3.5 mr-1" />Add firm</Button>}>
      {!p.firms.length ? (
        <div className="p-4"><Empty icon={<Building2 className="h-4 w-4" />} title="No firms yet" body="Add each prop firm you trade with, for example FTMO, Topstep or a custom firm. Rules are never pre-filled; you enter them per account." /></div>
      ) : (
        <div className="divide-y divide-card-border">
          {p.firms.map((f) => {
            const accs = p.accounts.filter((a) => a.firmId === f.id);
            return (
              <div key={f.id} className="row-hover px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" data-testid={`row-firm-${f.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13.5px] font-medium">{f.name}</span>
                    <Pill tone={f.status === "active" ? "signal" : "muted"}>{f.status}</Pill>
                    <Pill>{f.marketType}</Pill>
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-1 truncate">
                    {[f.platform || "No platform", `${accs.length} account${accs.length === 1 ? "" : "s"}`, f.website].filter(Boolean).join("  ·  ")}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(f)} data-testid={`button-edit-firm-${f.id}`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <EditorDialog key={editing === "new" ? "new" : editing.id} open onClose={() => setEditing(null)} initial={initial}
          title={editing === "new" ? "Add prop firm" : `Edit ${editing.name}`}
          description="Firms are archived rather than deleted so expense and payout history stays intact."
          validate={(d) => (!d.name.trim() ? "Firm name is required." : null)}
          onSubmit={(d) => save("firms", editing === "new" ? null : editing.id, { ...d, name: d.name.trim() })}>
          {(d, set) => <>
            <Field label="Firm name"><TextIn value={d.name} onChange={(v) => set("name", v)} testId="input-firm-name" placeholder="e.g. Topstep" /></Field>
            <Field label="Website (optional)"><TextIn value={d.website} onChange={(v) => set("website", v)} testId="input-firm-website" inputMode="url" placeholder="https://" /></Field>
            <Field label="Account technology"><Sel value={d.marketType} onChange={(v) => set("marketType", v as PropFirmInput["marketType"])} options={MARKETS.map((m) => [m, m === "Perpetuals" ? "Crypto perpetuals" : m])} testId="select-firm-market" /></Field>
            <Field label="Trading platform"><TextIn value={d.platform} onChange={(v) => set("platform", v)} testId="input-firm-platform" /></Field>
            <Field label="Status"><Sel value={d.status} onChange={(v) => set("status", v as PropFirmInput["status"])} options={[["active", "Active"], ["archived", "Archived"]]} testId="select-firm-status" /></Field>
            <Field label="Notes" className="sm:col-span-2"><TextArea value={d.notes} onChange={(v) => set("notes", v)} testId="input-firm-notes" /></Field>
          </>}
        </EditorDialog>
      )}
    </Panel>
  );
}
