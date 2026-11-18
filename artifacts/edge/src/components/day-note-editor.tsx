import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListDayNotesQueryKey, useSaveDayNote, useDeleteDayNote,
  type DayNote, type ListDayNotesParams,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errMsg } from "@/lib/format";

export function DayNoteEditor({ day, note, range, onDirtyChange, onBusyChange }: {
  day: string;
  note?: DayNote;
  range: ListDayNotesParams;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const qc = useQueryClient();
  const save = useSaveDayNote();
  const remove = useDeleteDayNote();
  const [wentWell, setWentWell] = useState(note?.wentWell ?? "");
  const [wentBadly, setWentBadly] = useState(note?.wentBadly ?? "");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const busy = save.isPending || remove.isPending;

  // Focus/background refreshes must never overwrite an unsaved draft.
  useEffect(() => {
    if (!dirty) {
      setWentWell(note?.wentWell ?? "");
      setWentBadly(note?.wentBadly ?? "");
    }
  }, [note?.wentWell, note?.wentBadly, dirty]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    if (dirty || busy) window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => {
    const guardLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      if (busy || (dirty && !window.confirm("Leave this page and discard your unsaved daily note?"))) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    if (dirty || busy) document.addEventListener("click", guardLink, true);
    return () => document.removeEventListener("click", guardLink, true);
  }, [dirty, busy]);

  function change(field: "well" | "badly", value: string) {
    if (field === "well") setWentWell(value); else setWentBadly(value);
    setDirty(true); onDirtyChange(true); setStatus(""); setError("");
  }
  async function persist(deleting = false) {
    if (deleting && !window.confirm("Remove this day's note? This cannot be undone.")) return;
    setError(""); setStatus("");
    // Block date changes immediately, before React renders the mutation state.
    onBusyChange(true);
    try {
      const saved = deleting ? (await remove.mutateAsync({ day }), undefined)
        : await save.mutateAsync({ day, data: { wentWell, wentBadly } });
      qc.setQueryData<DayNote[]>(getListDayNotesQueryKey(range), (current) => {
        const rest = (current ?? []).filter((n) => n.day !== day);
        return saved ? [...rest, saved].sort((a, b) => a.day.localeCompare(b.day)) : rest;
      });
      void qc.invalidateQueries({ queryKey: getListDayNotesQueryKey() });
      setDirty(false); onDirtyChange(false);
      setStatus(deleting ? "Note removed." : "Note saved.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <form className="p-4 space-y-4 border-b border-card-border" onSubmit={(e) => { e.preventDefault(); void persist(); }} data-testid="form-day-note">
      <div>
        <h3 className="text-sm font-medium">Daily reflection</h3>
        <p className="text-xs text-muted-foreground mt-1">Your notes for this date, independent of trades and filters.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`well-${day}`} className="text-xs font-medium">What went well</label>
        <Textarea id={`well-${day}`} value={wentWell} onChange={(e) => change("well", e.target.value)} maxLength={10000} rows={4} disabled={busy} placeholder="Good decisions, patience, following your plan…" data-testid="input-day-went-well" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`badly-${day}`} className="text-xs font-medium">What went badly</label>
        <Textarea id={`badly-${day}`} value={wentBadly} onChange={(e) => change("badly", e.target.value)} maxLength={10000} rows={4} disabled={busy} placeholder="Mistakes, frustrations, things to improve…" data-testid="input-day-went-badly" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !dirty || (!wentWell.trim() && !wentBadly.trim())} data-testid="button-save-day-note">{save.isPending ? "Saving…" : "Save note"}</Button>
        {note && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void persist(true)} data-testid="button-remove-day-note">{remove.isPending ? "Removing…" : "Remove note"}</Button>}
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
      {error && <p role="alert" className="text-xs text-destructive">{error} Your draft has not been cleared.</p>}
    </form>
  );
}
