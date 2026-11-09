import { useParams } from "wouter";
import { useGetTrade, getGetTradeQueryKey } from "@workspace/api-client-react";
import { Empty, ErrorBlock, LoadingBlock, PageHeader, Panel, WriteGate } from "@/components/kit";
import { TradeEditor } from "@/components/trade-editor";
import { useMode } from "@/lib/mode";

export default function TradeEdit() {
  const { id = "" } = useParams<{ id: string }>();
  const { canWrite } = useMode();
  const q = useGetTrade(id, undefined, { query: { enabled: !!id && canWrite, queryKey: getGetTradeQueryKey(id) } });
  if (!canWrite) return <Panel><Empty title="Editing is disabled here" body="Demo records cannot be modified. Sign in and switch to your workspace to edit your own trades." action={<WriteGate />} /></Panel>;
  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.error || !q.data) return <ErrorBlock error={q.error ?? new Error("Trade not found")} retry={() => q.refetch()} />;
  return (
    <div>
      <PageHeader eyebrow="Journal · Edit" title={`${q.data.symbol || "Untitled"} ${q.data.direction ?? ""}`.trim()} sub="Changes recalculate net P&L and R on save." />
      <TradeEditor key={q.data.id} initial={q.data} />
    </div>
  );
}
