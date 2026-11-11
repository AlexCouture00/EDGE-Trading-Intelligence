import { decodeJwt } from "jose";

type Environment = Record<string, string | undefined>;
export type AuthConfig = { url: string; publishableKey: string; allowedUserId: string };
export function supabaseAuthOptions(env: Environment): AuthConfig {
  const url = env.SUPABASE_URL ?? "";
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? "";
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Configure SUPABASE_URL."); }
  if (parsed.protocol !== "https:" || parsed.origin !== url || parsed.username || parsed.password
    || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)) {
    throw new Error("SUPABASE_URL must be the exact HTTPS Supabase project origin.");
  }
  // A public publishable/legacy anon key is sufficient. Never accept a service-role key.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    try { if (decodeJwt(key).role !== "anon") throw new Error(); }
    catch { throw new Error("Configure a Supabase publishable key, not a secret/service-role key."); }
  }
  const allowedUserId = env.EDGE_AUTHORIZED_USER_ID ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(allowedUserId)) {
    throw new Error("Configure one exact EDGE_AUTHORIZED_USER_ID UUID.");
  }
  return { url, publishableKey: key, allowedUserId: allowedUserId.toLowerCase() };
}
