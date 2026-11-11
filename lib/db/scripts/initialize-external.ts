import pg from "pg";
import { databasePoolConfig } from "../src/pool-config";
import { initializeEmptyDatabase } from "./migration-helpers";

async function main() {
  if (process.env.EDGE_CONFIRM_EMPTY_DATABASE !== "initialize-new-supabase") {
    throw new Error("Initialization requires EDGE_CONFIRM_EMPTY_DATABASE=initialize-new-supabase and explicit approval.");
  }
  // Never fall back to DATABASE_URL: that is the intact development database.
  const raw = process.env.MIGRATION_DATABASE_URL;
  if (!raw) throw new Error("Set MIGRATION_DATABASE_URL securely outside the source tree.");
  const url = new URL(raw);
  if (!/(?:\.pooler\.supabase\.com|\.supabase\.co)$/.test(url.hostname)) {
    throw new Error("This initializer only accepts a new Supabase database.");
  }
  const pool = new pg.Pool(databasePoolConfig(process.env, true));
  try {
    const client = await pool.connect();
    try {
      await initializeEmptyDatabase(client);
      process.stdout.write("New Supabase schema initialized and hardened. No demo or user data was copied.\n");
    } finally { client.release(); }
  } finally { await pool.end(); }
}
main().catch(() => {
  // Driver exceptions can include connection information; do not print them.
  process.stderr.write("Initialization failed or was refused. Verify approval, an EMPTY Supabase target, session/direct URL, certificate and privileges. Existing databases were not replaced. If schema was created before hardening failed, keep Data API disabled and review before retrying.\n");
  process.exitCode = 1;
});
