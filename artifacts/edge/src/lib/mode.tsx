import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";

type ModeCtx = {
  isLoaded: boolean;
  signedIn: boolean;
  demo: boolean;
  canWrite: boolean;
  setDemo: (v: boolean) => void;
  dp: { demo: true } | undefined;
};

const Ctx = createContext<ModeCtx | null>(null);
const KEY = "edge.demo";

export function ModeProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const qc = useQueryClient();
  const [explicitDemo, setExplicitDemo] = useState<boolean>(() => {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "true") return true;
    if (q === "false") return false;
    return sessionStorage.getItem(KEY) === "1";
  });

  const signedIn = !!isSignedIn;
  const demo = !signedIn || explicitDemo;

  const setDemo = useCallback((v: boolean) => {
    sessionStorage.setItem(KEY, v ? "1" : "0");
    setExplicitDemo(v);
  }, []);

  // Clear cache whenever identity or workspace mode changes; never mix datasets.
  const sig = `${userId ?? "anon"}|${demo ? "demo" : "own"}`;
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    if (prev.current !== null && prev.current !== sig) qc.clear();
    prev.current = sig;
  }, [sig, isLoaded, qc]);

  const value = useMemo<ModeCtx>(
    () => ({ isLoaded, signedIn, demo, canWrite: signedIn && !demo, setDemo, dp: demo ? { demo: true } : undefined }),
    [isLoaded, signedIn, demo, setDemo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMode() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMode outside ModeProvider");
  return c;
}
