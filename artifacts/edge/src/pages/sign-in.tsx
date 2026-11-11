import { useState, type FormEvent, type ReactNode } from "react";
import { usePrivateAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PrivateGate({ children }: { children: ReactNode }) {
  const auth = usePrivateAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  if (auth.ready && auth.authorized) return children;
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await auth.signIn(email, password); }
    finally { setPassword(""); setBusy(false); }
  }
  return <div className="min-h-[100dvh] grid lg:grid-cols-[1fr_520px] bg-background">
    <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border grid-bg">
      <div className="text-[15px] font-semibold tracking-[0.18em]">EDGE</div>
      <div className="max-w-md">
        <div className="eyebrow mb-4">Personal performance laboratory</div>
        <p className="text-[28px] leading-[1.2] tracking-[-0.02em] font-light">Find out which of your confluences actually precede your best trades — and how much evidence you really have.</p>
        <p className="text-sm text-muted-foreground mt-5">Your private trading journal. One authorized account.</p>
      </div>
      <div className="num text-[11px] text-muted-foreground">Gold · FX · Indices</div>
    </div>
    <div className="flex items-center justify-center px-4 py-10">
      <section className="panel p-7 w-full max-w-[420px]" aria-labelledby="sign-in-title">
        <div className="eyebrow mb-3">EDGE · Private journal</div>
        <h1 id="sign-in-title" className="text-2xl font-medium tracking-tight mb-2">Sign in to EDGE</h1>
        <p className="text-sm text-muted-foreground mb-6">Email and password access for the journal owner only. Public registration is disabled.</p>
        {!auth.configured ? <div role="alert" className="text-sm text-muted-foreground" data-testid="auth-setup-required">
          Supabase Auth needs configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this environment, then rebuild.
        </div> : !auth.ready ? <p role="status" className="text-sm text-muted-foreground">Verifying your session…</p>
          : auth.session ? <div className="space-y-4">
            <p role="alert" className="text-sm text-neg">{auth.error ?? "This session is not authorized."}</p>
            <Button onClick={() => void auth.signOut()} data-testid="button-auth-signout">Sign out</Button>
          </div> : <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} data-testid="input-signin-email" /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} data-testid="input-signin-password" /></div>
            {auth.error && <p role="alert" className="text-sm text-neg">{auth.error}</p>}
            <Button className="w-full" type="submit" disabled={busy} data-testid="button-signin">{busy ? "Signing in…" : "Sign in"}</Button>
          </form>}
      </section>
    </div>
  </div>;
}
