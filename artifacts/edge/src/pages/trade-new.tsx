import { Link } from "wouter";
import { useListAccounts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Empty, LoadingBlock, PageHeader, Panel, WriteGate } from "@/components/kit";
import { TradeEditor } from "@/components/trade-editor";
import { useMode } from "@/lib/mode";

export function NewTradeBody() {
  const accounts = useListAccounts();
  if (accounts.isLoading) return <LoadingBlock rows={8} />;
  if (!accounts.data?.some((a) => !a.archived)) {
    return <Panel><Empty title="Create an account first" body="Every trade belongs to an account so P&L can be measured in a single currency." action={<Button size="sm" asChild><Link href="/settings">Open settings</Link></Button>} /></Panel>;
  }
  return <TradeEditor />;
}

export default function TradeNew() {
  const { canWrite } = useMode();
  return (
    <div>
      <PageHeader eyebrow="Journal · New entry" title="Log a trade" sub="Only the account is needed for a draft. Open and closed trades need a little more." />
      {canWrite ? <NewTradeBody /> : (
        <Panel><Empty title="Logging requires your own workspace" body="The demo workspace is read-only sample data. Sign in to record trades privately." action={<WriteGate />} /></Panel>
      )}
    </div>
  );
}
