import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { attachDatabasePool } from "@vercel/functions";
import { databasePoolConfig } from "./pool-config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool(databasePoolConfig(process.env));
// Fluid compute may suspend warm instances; close idle connections safely.
// Keep the single module-level pool shared by concurrent invocations.
if (process.env.VERCEL) attachDatabasePool(pool);
pool.on("error", () => {
  // Never print driver errors or the connection configuration (credentials).
  process.stderr.write("An idle PostgreSQL connection failed.\n");
});
export const db = drizzle(pool, { schema });

export * from "./schema";
