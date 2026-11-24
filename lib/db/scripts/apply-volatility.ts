import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { databasePoolConfig } from "../src/pool-config";
import { edgeTables, migrationsFolder } from "./migration-helpers";

// Explicit maintenance command only. Never called by a build or application startup.
let stage = "checking approval and target";
async function main() {
  assert.equal(process.env.EDGE_CONFIRM_VOLATILITY_MIGRATION, "add-volatility-column");
  const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF;
  assert.match(expectedProject ?? "", /^[a-z]{20}$/);
  const target = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
  assert.match(target.hostname, /\.pooler\.supabase\.com$/);
  assert.equal(target.port, "5432");
  assert.equal(decodeURIComponent(target.username), `postgres.${expectedProject}`);
  assert.equal(target.pathname, "/postgres");
  const migrations = readMigrationFiles({ migrationsFolder });
  assert.equal(migrations.length, 4, "This command only permits the reviewed volatility release.");
  assert.equal(migrations[3]!.sql.join("").trim(), 'ALTER TABLE "edge_trades" ADD COLUMN "volatility" text;');
  const pool = new pg.Pool(databasePoolConfig(process.env, true));
  try {
    const client = await pool.connect();
    try {
      stage = "verifying TLS and database identity";
      const stream = (client as unknown as { connection: { stream: { encrypted?: boolean; authorized?: boolean } } }).connection.stream;
      assert.equal(stream.encrypted, true);
      assert.equal(stream.authorized, true);
      assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, "postgres");
      await client.query("SELECT pg_advisory_lock(hashtext('edge-approved-schema-upgrade'))");
      try {
        stage = "verifying migration history and security";
        const history = async () => (await client.query<{ hash: string; created_at: string }>(
          "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
        )).rows;
        const existing = await history();
        assert.ok(existing.length === 3 || existing.length === 4);
        existing.forEach((entry, index) => {
          assert.equal(entry.hash, migrations[index]!.hash);
          assert.equal(Number(entry.created_at), migrations[index]!.folderMillis);
        });
        const security = async () => (await client.query(
          `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl,
             NOT EXISTS (
               SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
               LEFT JOIN pg_roles r ON r.oid=a.grantee
               WHERE a.grantee=0 OR r.rolname IN ('anon','authenticated')
             ) AS restricted
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,
          [edgeTables],
        )).rows;
        const beforeSecurity = await security();
        assert.equal(beforeSecurity.length, edgeTables.length);
        assert.ok(beforeSecurity.every(row => row.relrowsecurity && row.restricted));
        const column = async () => (await client.query(
          `SELECT data_type,is_nullable,column_default FROM information_schema.columns
           WHERE table_schema='public' AND table_name='edge_trades' AND column_name='volatility'`,
        )).rows;
        const beforeColumn = await column();
        assert.equal(beforeColumn.length, existing.length === 4 ? 1 : 0);
        if (existing.length === 4) {
          assert.deepEqual(beforeColumn, [{ data_type: "text", is_nullable: "YES", column_default: null }]);
          process.stdout.write("Verified: volatility migration was already applied; no changes made.\n");
          return;
        }
        // Keep fingerprints private: no trade contents, owner IDs or credentials are logged.
        const fingerprint = async () => (await client.query(
          `SELECT count(*)::text AS count,
             md5(COALESCE(string_agg(md5((to_jsonb(t)-'volatility')::text),'' ORDER BY id),'')) AS digest
           FROM public.edge_trades t`,
        )).rows[0] as { count: string; digest: string };
        const before = await fingerprint();
        stage = "applying only the approved additive migration";
        await client.query("SET lock_timeout='5s'");
        await migrate(drizzle(client), { migrationsFolder });
        stage = "verifying the applied migration";
        assert.deepEqual(await column(), [{ data_type: "text", is_nullable: "YES", column_default: null }]);
        const afterHistory = await history();
        assert.equal(afterHistory.length, 4);
        afterHistory.forEach((entry, index) => {
          assert.equal(entry.hash, migrations[index]!.hash);
          assert.equal(Number(entry.created_at), migrations[index]!.folderMillis);
        });
        assert.deepEqual(await security(), beforeSecurity);
        const after = await fingerprint();
        assert.deepEqual(after, before, "Trade contents changed during the migration verification window.");
        const assigned = await client.query("SELECT count(*)::int AS n FROM public.edge_trades WHERE volatility IS NOT NULL");
        assert.equal(assigned.rows[0].n, 0);
        process.stdout.write("Verified: intended Supabase Session target, certificate-verified TLS, one nullable text column, four matching migrations, unchanged trade data and unchanged security restrictions. No demo data created.\n");
      } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext('edge-approved-schema-upgrade'))");
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  const category = typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "CHECK_FAILED";
  process.stderr.write(`Volatility migration stopped: stage=${stage}; category=${category}. No credentials or database contents were logged. Inspect migration history before retrying.\n`);
  process.exitCode = 1;
});
