import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { usePrivateAuth } from "@/lib/auth";
import { BarChart3, BookOpen, CalendarDays, Gauge, Layers, LineChart, LogOut, Menu, NotebookPen, Plus, Brain, Settings, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMode } from "@/lib/mode";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV = [
  { group: "Analyze", items: [
    { href: "/", label: "Overview", icon: Gauge },
    { href: "/performance", label: "Performance", icon: LineChart },
    { href: "/confluences", label: "Confluences", icon: Layers },
    { href: "/risk", label: "Risk", icon: ShieldAlert },
    { href: "/psychology", label: "Psychology", icon: Brain },
  ]},
  { group: "Record", items: [
    { href: "/journal", label: "Journal", icon: NotebookPen },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
  ]},
  { group: "Method", items: [
    { href: "/strategies", label: "Strategies", icon: BarChart3 },
    { href: "/playbook", label: "Playbook", icon: BookOpen },
    { href: "/settings", label: "Settings", icon: Settings },
  ]},
];

function Mark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2" data-testid="link-home">
      <svg viewBox="0 0 32 32" className="h-7 w-7"><rect width="32" height="32" rx="7" fill="hsl(220 7% 12%)" stroke="hsl(220 6% 20%)" /><path d="M9 22 L15 10 L18 17 L23 12" stroke="hsl(40 12% 94%)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-[0.18em]">EDGE</div>
        <div className="text-[9.5px] font-mono tracking-[0.16em] text-muted-foreground mt-1">TRADING INTELLIGENCE</div>
      </div>
    </Link>
  );
}

function Nav({ onNav }: { onNav?: () => void }) {
  const [loc] = useLocation();
  const { canWrite } = useMode();
  return (
    <nav className="flex flex-col gap-5 mt-6">
      {canWrite && (
        <Link href="/trades/new" onClick={onNav} className="mx-1 flex items-center justify-between rounded-md bg-primary text-primary-foreground px-3 h-9 text-[13px] font-medium transition-transform active:scale-[.98]" data-testid="link-new-trade">
          <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Log trade</span>
        </Link>
      )}
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="eyebrow px-3 mb-1.5">{g.group}</div>
          {g.items.map((it) => {
            const active = it.href === "/" ? loc === "/" : loc.startsWith(it.href);
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} onClick={onNav}
                className={cn("group relative flex items-center gap-2.5 mx-1 px-2.5 h-8 rounded-md text-[13px] transition-colors", active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50")}
                data-testid={`link-nav-${it.label.toLowerCase()}`}>
                {active && <span className="absolute -left-1 top-2 bottom-2 w-px bg-foreground" />}
                <Icon className="h-[15px] w-[15px] opacity-80" strokeWidth={1.6} />
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Identity() {
  const { signedIn } = useMode();
  const { session, signOut } = usePrivateAuth();
  if (!signedIn) {
    return (
      <div className="space-y-2">
        <Button asChild size="sm" variant="outline" className="w-full"><Link href="/sign-in" data-testid="link-signin">Sign in</Link></Button>
      </div>
    );
  }
  const initials = (session?.user.email?.[0] ?? "U").toUpperCase();
  return (
    <div className="space-y-3">
      <div className="eyebrow">Private journal</div>
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[11px] font-medium">{initials}</div>
        <div className="min-w-0 flex-1 text-[12px] truncate text-muted-foreground" data-testid="text-user-email">{session?.user.email ?? "Signed in"}</div>
        <button onClick={() => void signOut()} className="text-muted-foreground hover:text-foreground transition-colors" title="Sign out" data-testid="button-signout">
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}


export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-[100dvh] flex bg-background">
      <aside className="hidden md:flex w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 sticky top-0 h-[100dvh]">
        <Mark />
        <div className="flex-1 overflow-y-auto"><Nav /></div>
        <div className="pt-4 border-t border-sidebar-border"><Identity /></div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-sidebar border-r border-sidebar-border px-3 py-5 flex flex-col">
            <div className="flex items-center justify-between"><Mark /><button onClick={() => setOpen(false)} data-testid="button-close-menu"><X className="h-4 w-4" /></button></div>
            <div className="flex-1 overflow-y-auto"><Nav onNav={() => setOpen(false)} /></div>
            <div className="pt-4 border-t border-sidebar-border"><Identity /></div>
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden flex items-center justify-between px-4 h-12 border-b border-border">
          <Mark />
          <button onClick={() => setOpen(true)} data-testid="button-open-menu"><Menu className="h-5 w-5" /></button>
        </div>
        <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-[1440px] w-full">{children}</main>
      </div>
    </div>
  );
}

