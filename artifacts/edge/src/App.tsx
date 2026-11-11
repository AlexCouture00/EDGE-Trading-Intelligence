import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Shell } from "@/components/shell";
import { ModeProvider } from "@/lib/mode";
import { AuthProvider } from "@/lib/auth";
import { PrivateGate } from "@/pages/sign-in";
import { FiltersProvider } from "@/lib/filters";
import Overview from "@/pages/overview";
import Journal from "@/pages/journal";
import TradeNew from "@/pages/trade-new";
import TradeDetail from "@/pages/trade-detail";
import TradeEdit from "@/pages/trade-edit";
import Confluences from "@/pages/confluences";
import Strategies from "@/pages/strategies";
import Performance from "@/pages/performance";
import Risk from "@/pages/risk";
import Psychology from "@/pages/psychology";
import CalendarPage from "@/pages/calendar";
import Playbook from "@/pages/playbook";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
export default function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
    <QueryClientProvider client={queryClient}><AuthProvider><TooltipProvider delayDuration={250}>
      <PrivateGate><ModeProvider><FiltersProvider><Shell><RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Overview} /><Route path="/journal" component={Journal} />
          <Route path="/trades/new" component={TradeNew} /><Route path="/trades/:id/edit" component={TradeEdit} />
          <Route path="/trades/:id" component={TradeDetail} /><Route path="/confluences" component={Confluences} />
          <Route path="/strategies" component={Strategies} /><Route path="/performance" component={Performance} />
          <Route path="/risk" component={Risk} /><Route path="/psychology" component={Psychology} />
          <Route path="/calendar" component={CalendarPage} /><Route path="/playbook" component={Playbook} />
          <Route path="/settings" component={SettingsPage} /><Route path="/sign-in" component={Overview} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary></Shell></FiltersProvider></ModeProvider></PrivateGate>
      <Toaster />
    </TooltipProvider></AuthProvider></QueryClientProvider>
  </WouterRouter>;
}
