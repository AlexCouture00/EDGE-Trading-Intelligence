import { useState } from "react";
import { DatabaseZap, RotateCw } from "lucide-react";
import { Caution, ErrorBlock, LoadingBlock, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { asPortfolio, isMigrationNeeded, usePortfolio } from "@/components/prop-manager/shared";
import { Overview } from "@/components/prop-manager/overview";
import { Firms } from "@/components/prop-manager/firms";
import { Accounts } from "@/components/prop-manager/accounts";
import { Rules } from "@/components/prop-manager/rules";
import { Expenses, Payouts } from "@/components/prop-manager/cashflow";

const TABS = [["overview", "Overview"], ["firms", "Firms"], ["accounts", "Accounts & balances"], ["rules", "Rules"], ["expenses", "Expenses"], ["payouts", "Payouts"]] as const;

export default function PropManager() {
  const q = usePortfolio();
  const [tab, setTab] = useState("overview");
  return (
    <div>
      <PageHeader eyebrow="Record" title="Prop Firm Manager" sub="Firms, accounts, balance snapshots, rules, trading expenses and payouts. Allocations are notional, never personal assets."
        actions={<Button size="sm" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching} data-testid="button-refresh-prop"><RotateCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>} />
      {q.data && q.isError && <Caution>Portfolio refresh failed. The last loaded data and any open form have been kept. Retry Refresh before relying on these totals.</Caution>}
      {q.isLoading ? <LoadingBlock rows={6} /> : q.isError && !q.data ? (
        isMigrationNeeded(q.error) ? (
          <div className="panel p-6 flex flex-col items-start gap-3" data-testid="status-migration-needed">
            <DatabaseZap className="h-5 w-5 text-caution" />
            <div className="eyebrow text-caution">Storage not installed</div>
            <p className="text-sm text-muted-foreground max-w-lg">The Prop Firm Manager tables have not been created yet. Once the pending database migration is approved and applied, this page will load. No data has been lost.</p>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()} data-testid="button-retry">Check again</Button>
          </div>
        ) : <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : q.data ? (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-5">
            <TabsList className="bg-card border border-card-border h-9">
              {TABS.map(([v, l]) => <TabsTrigger key={v} value={v} className="text-[12.5px]" data-testid={`tab-${v}`}>{l}</TabsTrigger>)}
            </TabsList>
          </div>
          <TabsContent value="overview"><Overview p={asPortfolio(q.data)} /></TabsContent>
          <TabsContent value="firms"><Firms p={asPortfolio(q.data)} /></TabsContent>
          <TabsContent value="accounts"><Accounts p={asPortfolio(q.data)} /></TabsContent>
          <TabsContent value="rules"><Rules p={asPortfolio(q.data)} /></TabsContent>
          <TabsContent value="expenses"><Expenses p={asPortfolio(q.data)} /></TabsContent>
          <TabsContent value="payouts"><Payouts p={asPortfolio(q.data)} /></TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
