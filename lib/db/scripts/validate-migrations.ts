import pg from "pg";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { databasePoolConfig } from "../src/pool-config";
import { edgeTables, initializeEmptyDatabase, migrationsFolder } from "./migration-helpers";

let stage = "checking local development connection";
async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("Migration validation is local-development only.");
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  const admin = new pg.Pool(databasePoolConfig(process.env));
  const name = `edge_validation_${randomUUID().replaceAll("-", "")}`;
  let created = false;
  let isolated: pg.Pool | undefined;
  try {
    // pg supports Unix socket URLs in several forms, including URL-encoded
    // hostnames. Verify the actual connected server, not just URL syntax.
    const connection = await admin.query("SELECT inet_server_addr() IS NULL OR inet_server_addr() IN ('127.0.0.1'::inet, '::1'::inet) AS local");
    if (connection.rows[0].local !== true) {
      throw new Error("Validation requires local PostgreSQL; remote databases are never created or dropped.");
    }
    // Identifier is generated locally from a UUID, never user-controlled.
    stage = "creating isolated database";
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    url.searchParams.delete("database");
    url.searchParams.delete("dbname");
    isolated = new pg.Pool(databasePoolConfig({ ...process.env, DATABASE_URL: url.toString() }));
    const client = await isolated.connect();
    try {
      stage = "initializing isolated schema";
      await initializeEmptyDatabase(client);
      stage = "checking schema and foreign keys";
      const tables = await client.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
      assert.deepEqual(tables.rows.map((r) => r.tablename).sort(), [...edgeTables].sort());
      assert.ok(tables.rows.every((r) => r.rowsecurity));
      for (const table of edgeTables) {
        const result = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
        assert.equal(result.rows[0].n, 0);
      }
      const constraints = await client.query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace");
      assert.equal(constraints.rows[0].n, 6);
      const journal = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      const expected = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")).entries.length;
      assert.equal(journal.rows[0].n, expected);
      await migrate(drizzle(client), { migrationsFolder });
      const rerun = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      assert.equal(rerun.rows[0].n, expected);
      await assert.rejects(initializeEmptyDatabase(client), /not a new empty database/);
    } finally { client.release(); }
    // Run the actual financial/ownership suite against this separate DB.
    stage = "running API tests on isolated database";
    const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "run", "test"], {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "inherit",
    });
    assert.equal(result.status, 0, "API tests against isolated migrated database failed");
    process.stdout.write("Migration validation passed: 8 tables, 6 foreign keys, RLS, empty data, journal, repeat safety and API tests.\n");
  } finally {
    await isolated?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}
main().catch((error: unknown) => {
  const code = typeof error === "object" && error && "code" in error && /^[A-Z0-9_]+$/.test(String(error.code)) ? String(error.code) : "ERROR";
  process.stderr.write(`Isolated migration validation failed while ${stage} (${code}). No existing development database was replaced.\n`);
  process.exitCode = 1;
});
