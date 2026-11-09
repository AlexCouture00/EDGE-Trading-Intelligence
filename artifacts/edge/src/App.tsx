import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Shell } from '@/components/shell';
import { ModeProvider } from '@/lib/mode';
import { FiltersProvider } from '@/lib/filters';
import Overview from '@/pages/overview';
import Journal from '@/pages/journal';
import TradeNew from '@/pages/trade-new';
import TradeDetail from '@/pages/trade-detail';
import TradeEdit from '@/pages/trade-edit';
import Confluences from '@/pages/confluences';
import Strategies from '@/pages/strategies';
import Performance from '@/pages/performance';
import Risk from '@/pages/risk';
import Psychology from '@/pages/psychology';
import CalendarPage from '@/pages/calendar';
import Playbook from '@/pages/playbook';
import SettingsPage from '@/pages/settings';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(40 12% 94%)',
    colorForeground: 'hsl(40 12% 95%)',
    colorMutedForeground: 'hsl(220 5% 62%)',
    colorDanger: 'hsl(0 52% 62%)',
    colorBackground: 'hsl(220 7% 8.5%)',
    colorInput: 'hsl(220 7% 11%)',
    colorInputForeground: 'hsl(40 12% 95%)',
    colorNeutral: 'hsl(40 12% 95%)',
    fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif",
    borderRadius: '0.375rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(220_7%_8.5%)] border border-[hsl(220_6%_15%)] rounded-lg w-[420px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[hsl(40_12%_95%)] font-medium tracking-tight',
    headerSubtitle: 'text-[hsl(220_5%_62%)]',
    socialButtonsBlockButtonText: 'text-[hsl(40_12%_92%)]',
    formFieldLabel: 'text-[hsl(40_10%_85%)]',
    footerActionLink: 'text-[hsl(40_12%_95%)] underline underline-offset-4',
    footerActionText: 'text-[hsl(220_5%_62%)]',
    dividerText: 'text-[hsl(220_5%_55%)]',
    identityPreviewEditButton: 'text-[hsl(40_12%_92%)]',
    formFieldSuccessText: 'text-[hsl(152_34%_60%)]',
    alertText: 'text-[hsl(40_12%_92%)]',
    logoBox: 'h-9',
    logoImage: 'h-9 w-9',
    socialButtonsBlockButton: 'border border-[hsl(220_6%_19%)] bg-[hsl(220_7%_11%)]',
    formButtonPrimary: 'bg-[hsl(40_12%_94%)] text-[hsl(220_9%_6%)]',
    formFieldInput: 'bg-[hsl(220_7%_11%)] border border-[hsl(220_6%_19%)] text-[hsl(40_12%_95%)]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[hsl(220_6%_17%)]',
    alert: 'border border-[hsl(220_6%_19%)] bg-[hsl(220_7%_11%)]',
    otpCodeFieldInput: 'border border-[hsl(220_6%_22%)] text-[hsl(40_12%_95%)]',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[1fr_520px] bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border grid-bg">
        <div className="text-[15px] font-semibold tracking-[0.18em]">EDGE</div>
        <div className="max-w-md">
          <div className="eyebrow mb-4">Personal performance laboratory</div>
          <p className="text-[28px] leading-[1.2] tracking-[-0.02em] font-light">
            Find out which of your confluences actually precede your best trades — and how much evidence you really have.
          </p>
          <p className="text-sm text-muted-foreground mt-5">Observed results only. Small samples are flagged, not celebrated.</p>
        </div>
        <div className="num text-[11px] text-muted-foreground">Gold · FX · Indices</div>
      </div>
      <div className="flex items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}

function SignInPage() {
  return (
    <AuthFrame>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthFrame>
  );
}

function SignUpPage() {
  return (
    <AuthFrame>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthFrame>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route>
        <ModeProvider>
          <FiltersProvider>
            <Shell>
              <RoutedErrorBoundary>
                <Switch>
                  <Route path="/" component={Overview} />
                  <Route path="/journal" component={Journal} />
                  <Route path="/trades/new" component={TradeNew} />
                  <Route path="/trades/:id/edit" component={TradeEdit} />
                  <Route path="/trades/:id" component={TradeDetail} />
                  <Route path="/confluences" component={Confluences} />
                  <Route path="/strategies" component={Strategies} />
                  <Route path="/performance" component={Performance} />
                  <Route path="/risk" component={Risk} />
                  <Route path="/psychology" component={Psychology} />
                  <Route path="/calendar" component={CalendarPage} />
                  <Route path="/playbook" component={Playbook} />
                  <Route path="/settings" component={SettingsPage} />
                  <Route component={NotFound} />
                </Switch>
              </RoutedErrorBoundary>
            </Shell>
          </FiltersProvider>
        </ModeProvider>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Sign in to EDGE', subtitle: 'Your private journal and analytics' } },
        signUp: { start: { title: 'Create your workspace', subtitle: 'Private by default. Start empty, with ten editable confluences.' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider delayDuration={250}>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
