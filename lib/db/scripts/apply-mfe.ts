import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { databasePoolConfig } from "../src/pool-config";
import { edgeTables, migrationsFolder } from "./migration-helpers";

// Explicit, approval-gated maintenance only: never imported at startup/build.
let stage = "checking approval and target";
async function main() {
  assert.equal(process.env.EDGE_CONFIRM_MFE_MIGRATION, "add-mfe-column");
  const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF;
  assert.match(expectedProject ?? "", /^[a-z]{20}$/);
  const target = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
  assert.match(target.hostname, /\.pooler\.supabase\.com$/);
  assert.equal(target.port, "5432");
  assert.equal(decodeURIComponent(target.username), `postgres.${expectedProject}`);
  assert.equal(target.pathname, "/postgres");
  const migrations = readMigrationFiles({ migrationsFolder });
  assert.equal(migrations.length, 5, "Only the reviewed MFE release is permitted.");
  assert.equal(migrations[4]!.sql.join("").trim(), 'ALTER TABLE "edge_trades" ADD COLUMN "mfe_r" numeric(28, 8);');
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
        stage = "verifying existing migrations and security restrictions";
        const history = async () => (await client.query<{ hash: string; created_at: string }>(
          "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
        )).rows;
        const assertHistory = (entries: Awaited<ReturnType<typeof history>>) => entries.forEach((entry, i) => {
          assert.equal(entry.hash, migrations[i]!.hash);
          assert.equal(Number(entry.created_at), migrations[i]!.folderMillis);
        });
        const existing = await history();
        assert.ok(existing.length === 4 || existing.length === 5);
        assertHistory(existing);
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
          `SELECT data_type,is_nullable,column_default,numeric_precision,numeric_scale
           FROM information_schema.columns
           WHERE table_schema='public' AND table_name='edge_trades' AND column_name='mfe_r'`,
        )).rows;
        const expectedColumn = [{ data_type: "numeric", is_nullable: "YES", column_default: null, numeric_precision: 28, numeric_scale: 8 }];
        const beforeColumn = await column();
        assert.equal(beforeColumn.length, existing.length === 5 ? 1 : 0);
        if (existing.length === 5) {
          assert.deepEqual(beforeColumn, expectedColumn);
          process.stdout.write("Verified: MFE migration already applied; no changes made.\n");
          return;
        }
        // Fingerprints stay in memory; no contents, identities or secrets are logged.
        const fingerprint = async () => (await client.query(
          `SELECT count(*)::text AS count,
             md5(COALESCE(string_agg(md5((to_jsonb(t)-'mfe_r')::text),'' ORDER BY id),'')) AS digest
           FROM public.edge_trades t`,
        )).rows[0];
        const before = await fingerprint();
        stage = "applying only the approved nullable MFE column";
        await client.query("SET lock_timeout='5s'");
        await migrate(drizzle(client), { migrationsFolder });
        stage = "verifying migration, unchanged data and security";
        assert.deepEqual(await column(), expectedColumn);
        const afterHistory = await history();
        assert.equal(afterHistory.length, 5);
        assertHistory(afterHistory);
        assert.deepEqual(await security(), beforeSecurity);
        assert.deepEqual(await fingerprint(), before, "Trade data changed during verification.");
        assert.equal((await client.query("SELECT count(*)::int AS n FROM public.edge_trades WHERE mfe_r IS NOT NULL")).rows[0].n, 0);
        process.stdout.write("Verified: intended Supabase Session target, certificate-verified TLS, one nullable numeric(28,8) column, five matching migrations, unchanged trade data and unchanged security restrictions. No data seeded.\n");
      } finally { await client.query("SELECT pg_advisory_unlock(hashtext('edge-approved-schema-upgrade'))"); }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  const category = typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "CHECK_FAILED";
  process.stderr.write(`MFE migration stopped: stage=${stage}; category=${category}. No credentials or database contents logged. Check migration history before retrying.\n`);
  process.exitCode = 1;
});
