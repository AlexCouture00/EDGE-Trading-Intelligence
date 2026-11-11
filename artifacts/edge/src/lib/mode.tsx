import { createContext, useContext, type ReactNode } from "react";
import { usePrivateAuth } from "./auth";
// Preserve the analytics components' existing interface without a public/demo mode.
type ModeCtx = {
  isLoaded: boolean; signedIn: boolean; demo: boolean; canWrite: boolean;
  setDemo: (v: boolean) => void; dp: { demo: true } | undefined;
};
const Ctx = createContext<ModeCtx | null>(null);
export function ModeProvider({ children }: { children: ReactNode }) {
  const auth = usePrivateAuth();
  return <Ctx.Provider value={{ isLoaded: auth.ready, signedIn: auth.authorized, demo: false,
    canWrite: auth.authorized, setDemo: () => {}, dp: undefined }}>{children}</Ctx.Provider>;
}
export function useMode() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useMode outside ModeProvider");
  return value;
}
