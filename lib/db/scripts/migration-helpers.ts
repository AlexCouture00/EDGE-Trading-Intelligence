import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";

export const migrationsFolder = fileURLToPath(new URL("../drizzle/", import.meta.url));
export const edgeTables = [
  "edge_accounts", "edge_cash_flows", "edge_settings", "edge_confluences",
  "edge_strategies", "edge_trades", "edge_executions", "edge_trade_confluences",
];

export async function initializeEmptyDatabase(client: PoolClient) {
  // Session-mode/direct connection only. One client holds this lock through DDL.
  await client.query("SELECT pg_advisory_lock(hashtext('edge-empty-database-initializer'))");
  try {
    const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    const journal = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS journal");
    if (existing.rowCount || journal.rows[0].journal) {
      throw new Error("Refusing initialization: target is not a new empty database. No existing tables may be overwritten.");
    }
    // Apply the unchanged, versioned Drizzle migration. Never use push or force.
    await migrate(drizzle(client), { migrationsFolder });
    const hardening = await readFile(new URL("../supabase/hardening.sql", import.meta.url), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(hardening);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('edge-empty-database-initializer'))");
  }
}
