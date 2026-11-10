type Environment = Record<string, string | undefined>;

/** Independent Clerk production configuration; managed development is unchanged. */
export function externalClerkOptions(env: Environment) {
  if (!env.CLERK_PUBLISHABLE_KEY || !env.CLERK_SECRET_KEY) {
    throw new Error("Vercel requires CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
  }
  const origins = (env.CLERK_AUTHORIZED_PARTIES ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!origins.length) throw new Error("CLERK_AUTHORIZED_PARTIES must list the exact allowed HTTPS origins.");
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error("Invalid CLERK_AUTHORIZED_PARTIES origin."); }
    if (url.protocol !== "https:" || url.origin !== origin || origin.includes("*") || url.username || url.password) {
      throw new Error("CLERK_AUTHORIZED_PARTIES requires exact HTTPS origins without paths or wildcards.");
    }
  }
  return {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
    authorizedParties: origins,
  };
}
