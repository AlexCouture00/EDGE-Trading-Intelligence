import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const storageKey = "edge.personal.auth";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
let client: ReturnType<typeof createClient> | null = null;
try {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url && key && !key.startsWith("sb_secret_")) {
    client = createClient(url, key, { auth: { storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
} catch { /* Explicit setup state is rendered instead of an unsecured workspace. */ }
setAuthTokenGetter(async () => (await client?.auth.getSession())?.data.session?.access_token ?? null);

type AuthState = {
  session: Session | null; ready: boolean; authorized: boolean; error: string | null; configured: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(!client);
  const [checking, setChecking] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useRef<string | null>(null);
  const verifiedUser = useRef<string | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    let events = 0;
    const apply = (next: Session | null) => {
      if (!active) return;
      const id = next?.user.id ?? null;
      if (id !== currentUser.current) {
        qc.clear(); setAuthorized(false); verifiedUser.current = null;
      }
      currentUser.current = id;
      setSession(next); setLoaded(true);
    };
    const { data } = client.auth.onAuthStateChange((_event, next) => { events++; apply(next); });
    void client.auth.getSession().then(({ data, error }) => {
      if (active && events === 0) { apply(data.session); if (error) setError("Your session could not be restored. Sign in again."); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [qc]);
  useEffect(() => {
    if (!session) { setChecking(false); return; }
    const abort = new AbortController();
    if (verifiedUser.current !== session.user.id) { setChecking(true); setAuthorized(false); }
    setError(null);
    void fetch(`${base}/api/auth/session`, {
      headers: { Authorization: `Bearer ${session.access_token}` }, signal: abort.signal, cache: "no-store",
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403
        ? "This account is not authorized for this private journal."
        : response.status === 503 ? "Private authentication is not configured or is temporarily unavailable."
          : "Your session is invalid or expired. Sign out and sign in again.");
      const user = await response.json();
      if (user.id !== session.user.id) throw new Error("The session could not be verified.");
      if (!abort.signal.aborted) { verifiedUser.current = session.user.id; setAuthorized(true); }
    }).catch(e => { if (!abort.signal.aborted) { qc.clear(); setAuthorized(false); verifiedUser.current = null; setError(e instanceof Error ? e.message : "Unable to verify your session."); } })
      .finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, [session, qc]);
  async function signIn(email: string, password: string) {
    if (!client) return false;
    setError(null);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError("Unable to sign in. Check your email and password, or try again later."); return false; }
    return true;
  }
  async function signOut() {
    qc.clear(); setAuthorized(false); setSession(null); setError(null);
    try { await client?.auth.signOut({ scope: "local" }); }
    catch { /* Local logout still completes if the provider is unreachable. */ }
    finally {
      // Also discard local state if the provider cannot be reached during logout.
      localStorage.removeItem(storageKey);
      qc.clear(); setSession(null); setAuthorized(false); verifiedUser.current = null; currentUser.current = null;
    }
  }
  return <Context.Provider value={{ session, ready: loaded && !checking, authorized, error, configured: !!client, signIn, signOut }}>{children}</Context.Provider>;
}
export function usePrivateAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("usePrivateAuth requires AuthProvider");
  return value;
}
