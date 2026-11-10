import type { PoolConfig } from "pg";

type Environment = Record<string, string | undefined>;

function integer(value: string | undefined, fallback: number, name: string, max: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}.`);
  }
  return parsed;
}

export function databasePoolConfig(env: Environment, migration = false): PoolConfig {
  const name = migration ? "MIGRATION_DATABASE_URL" : "DATABASE_URL";
  const raw = env[name];
  if (!raw) throw new Error(`${name} is required.`);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${name} must be a PostgreSQL URL.`); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${name} must be a PostgreSQL URL.`);
  }
  const isSupabase = /(?:\.pooler\.supabase\.com|\.supabase\.co)$/.test(url.hostname);
  if (env.VERCEL && !migration && (!isSupabase || url.port !== "6543")) {
    throw new Error("Vercel requires a Supabase transaction-pooler DATABASE_URL on port 6543.");
  }
  if (migration && url.port === "6543") {
    throw new Error("Use a direct or session-mode connection for migrations, not transaction mode.");
  }
  const secure = Boolean(env.VERCEL) || isSupabase || env.DATABASE_SSL === "true";
  if (secure) {
    // pg parses URL SSL parameters after config and can replace the SSL object.
    // Remove them so certificate verification cannot silently be disabled.
    if (url.searchParams.get("sslmode") === "disable") {
      throw new Error("TLS cannot be disabled for the external database.");
    }
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
      url.searchParams.delete(key);
    }
  }
  return {
    connectionString: secure ? url.toString() : raw,
    ...(secure ? { ssl: {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}),
    } } : {}),
    max: migration ? 1 : integer(env.DATABASE_POOL_MAX, env.VERCEL ? 3 : 10, "DATABASE_POOL_MAX", 20),
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000,
    query_timeout: 25_000,
    application_name: migration ? "edge-schema-initializer" : "edge-api",
  };
}
