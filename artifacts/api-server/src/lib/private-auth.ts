import { createClient, type User } from "@supabase/supabase-js";
import { decodeJwt, decodeProtectedHeader } from "jose";
import type { RequestHandler } from "express";
import { supabaseAuthOptions, type AuthConfig } from "./auth-options";

export class AuthFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type VerifiedUser = Pick<User, "id" | "email" | "is_anonymous">;
type VerifyUser = (token: string) => Promise<{ user: VerifiedUser | null; status?: number }>;

/** getUser calls Supabase Auth over verified HTTPS to validate the JWT signature.
 * Claims are inspected only AFTER that trusted verification. This supports both
 * asymmetric signing keys and legacy HS256 without giving Express a signing key.
 */
export function createPrivateVerifier(config: AuthConfig, verifyUser: VerifyUser) {
  return async (authorization: string | undefined): Promise<VerifiedUser> => {
    if (!authorization || !/^Bearer [A-Za-z0-9._-]+$/i.test(authorization) || authorization.length > 8192) {
      throw new AuthFailure(401, "Sign in to access your private journal.");
    }
    const token = authorization.slice(7);
    try {
      const header = decodeProtectedHeader(token);
      if (typeof header.alg !== "string" || !["HS256", "ES256", "RS256"].includes(header.alg)) throw new Error();
    } catch { throw new AuthFailure(401, "Invalid or expired session. Sign in again."); }
    let verified: Awaited<ReturnType<VerifyUser>>;
    try { verified = await verifyUser(token); }
    catch { throw new AuthFailure(503, "Authentication is temporarily unavailable."); }
    if (!verified.user) {
      if (!verified.status || verified.status >= 500) throw new AuthFailure(503, "Authentication is temporarily unavailable.");
      throw new AuthFailure(401, "Invalid or expired session. Sign in again.");
    }
    let sub: string | undefined;
    try {
      const claims = decodeJwt(token), now = Date.now() / 1000;
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== `${config.url}/auth/v1` || !audiences.includes("authenticated")
        || claims.role !== "authenticated" || typeof claims.exp !== "number" || claims.exp <= now
        || (typeof claims.nbf === "number" && claims.nbf > now + 30)
        || typeof claims.iat !== "number" || claims.iat > now + 30
        || claims.sub !== verified.user.id || verified.user.is_anonymous) throw new Error();
      sub = claims.sub;
    } catch { throw new AuthFailure(401, "Invalid or expired session. Sign in again."); }
    if (sub !== config.allowedUserId) throw new AuthFailure(403, "This journal is private. This account is not authorized.");
    return verified.user;
  };
}

export function privateSessionMiddleware(verify: ReturnType<typeof createPrivateVerifier>): RequestHandler {
  return async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const user = await verify(req.headers.authorization);
    res.locals.ownerId = user.id;
    res.locals.authUser = { id: user.id, email: user.email ?? null };
    next();
  } catch (error) {
    if (error instanceof AuthFailure) { res.status(error.status).json({ error: error.message }); return; }
    res.status(503).json({ error: "Authentication is temporarily unavailable." });
  }
  };
}
let verifier: ReturnType<typeof createPrivateVerifier> | undefined;
export const privateAuth = privateSessionMiddleware(async authorization => {
    if (!verifier) {
      let config: AuthConfig;
      try { config = supabaseAuthOptions(process.env); }
      catch { throw new AuthFailure(503, "Private authentication is not configured. Contact the journal owner."); }
      const supabase = createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
      });
      verifier = createPrivateVerifier(config, async token => {
        const { data, error } = await supabase.auth.getUser(token);
        return { user: data.user, status: error?.status };
      });
    }
    return verifier(authorization);
});
