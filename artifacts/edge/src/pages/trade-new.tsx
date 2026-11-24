import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Empty, LoadingBlock, PageHeader, Panel, WriteGate } from "@/components/kit";
import { TradeEditor } from "@/components/trade-editor";
import { useMode } from "@/lib/mode";

export function NewTradeBody() {
  return <TradeEditor />;
}

export default function TradeNew() {
  const { canWrite } = useMode();
  return (
    <div>
      <PageHeader eyebrow="Journal · New entry" title="Log a trade" sub="Record the setup and outcome. No account setup or starting balance needed; drafts can be completed later." />
      {canWrite ? <NewTradeBody /> : (
        <Panel><Empty title="Logging requires your own workspace" body="The demo workspace is read-only sample data. Sign in to record trades privately." action={<WriteGate />} /></Panel>
      )}
    </div>
  );
}
