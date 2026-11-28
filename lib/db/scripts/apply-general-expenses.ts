import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { databasePoolConfig } from "../src/pool-config";
import { edgeTables, migrationsFolder } from "./migration-helpers";

// Approval-gated maintenance only. Never imported by builds or application code.
// Default mode is read-only; --apply additionally requires explicit confirmation.
const reviewedSql = 'ALTER TABLE "edge_prop_expenses" ALTER COLUMN "firm_id" DROP NOT NULL;';
let stage = "checking approved target";
async function main() {
  const apply = process.argv.includes("--apply");
  assert.ok(process.argv.slice(2).every(arg => arg === "--apply"), "Unexpected argument");
  if (apply) assert.equal(process.env.EDGE_CONFIRM_GENERAL_EXPENSES_MIGRATION, "optional-firm-expenses");
  const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF;
  assert.match(expectedProject ?? "", /^[a-z]{20}$/);
  const target = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
  assert.match(target.hostname, /\.pooler\.supabase\.com$/);
  assert.equal(target.port, "5432");
  assert.equal(decodeURIComponent(target.username), `postgres.${expectedProject}`);
  assert.equal(target.pathname, "/postgres");
  const migrations = readMigrationFiles({ migrationsFolder });
  assert.equal(migrations.length, 6, "Only the reviewed general-expenses release is permitted.");
  assert.equal(migrations[5]!.sql.join("").trim(), reviewedSql);
  const pool = new pg.Pool(databasePoolConfig(process.env, true));
  try {
    const client = await pool.connect();
    try {
      stage = "verifying certificate-verified TLS and database identity";
      const stream = (client as unknown as { connection: { stream: { encrypted?: boolean; authorized?: boolean } } }).connection.stream;
      assert.equal(stream.encrypted, true);
      assert.equal(stream.authorized, true);
      assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, "postgres");
      await client.query("SELECT pg_advisory_lock(hashtext('edge-approved-schema-upgrade'))");
      try {
        if (!apply) await client.query("BEGIN READ ONLY");
        stage = "verifying migration history";
        const history = async () => (await client.query<{ hash: string; created_at: string }>(
          "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
        )).rows;
        const assertHistory = (rows: Awaited<ReturnType<typeof history>>) => rows.forEach((row, i) => {
          assert.equal(row.hash, migrations[i]!.hash);
          assert.equal(Number(row.created_at), migrations[i]!.folderMillis);
        });
        const existing = await history();
        assert.ok(existing.length === 5 || existing.length === 6);
        assertHistory(existing);
        const security = async () => (await client.query(
          `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
              LEFT JOIN pg_roles r ON r.oid=a.grantee
              WHERE a.grantee=0 OR r.rolname IN ('anon','authenticated')
            ) AS restricted
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [edgeTables],
        )).rows;
        const column = async () => (await client.query(
          `SELECT data_type,is_nullable,column_default FROM information_schema.columns
           WHERE table_schema='public' AND table_name='edge_prop_expenses' AND column_name='firm_id'`,
        )).rows;
        const constraints = async () => (await client.query(
          `SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
           FROM pg_constraint c WHERE c.conrelid='public.edge_prop_expenses'::regclass ORDER BY c.conname`,
        )).rows;
        stage = "verifying existing security and schema";
        const beforeSecurity = await security(), beforeConstraints = await constraints();
        assert.equal(beforeSecurity.length, edgeTables.length);
        assert.ok(beforeSecurity.every(row => row.relrowsecurity && row.restricted));
        assert.ok(beforeConstraints.some(row => String(row.definition).includes("FOREIGN KEY (firm_id)")));
        const expectedColumn = [{ data_type: "uuid", is_nullable: "YES", column_default: null }];
        assert.deepEqual(await column(), existing.length === 6 ? expectedColumn : [
          { data_type: "uuid", is_nullable: "NO", column_default: null },
        ]);
        if (!apply || existing.length === 6) {
          process.stdout.write(JSON.stringify({
            mode: apply ? "already_applied" : "read_only_audit",
            targetProjectMatched: true, sessionPooler: true, tlsVerified: true,
            migrationsVerified: existing.length, protectedTablesVerified: beforeSecurity.length,
            reviewedChangePending: existing.length === 5, credentialsLogged: false,
          }) + "\n");
          return;
        }
        // Compare every EDGE table in memory. Never log row contents or hashes.
        const fingerprints = async () => {
          const result = [];
          for (const table of edgeTables) {
            assert.match(table, /^edge_[a-z_]+$/);
            result.push((await client.query(
              `SELECT count(*)::text AS count,
                md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest
               FROM public.${table} t`,
            )).rows[0]);
          }
          return result;
        };
        const before = await fingerprints();
        stage = "applying only the approved optional firm relationship";
        await client.query("SET lock_timeout='5s'");
        await migrate(drizzle(client), { migrationsFolder });
        stage = "verifying unchanged records, relationships and protections";
        assert.deepEqual(await column(), expectedColumn);
        const afterHistory = await history();
        assert.equal(afterHistory.length, 6);
        assertHistory(afterHistory);
        assert.deepEqual(await constraints(), beforeConstraints);
        assert.deepEqual(await security(), beforeSecurity);
        assert.deepEqual(await fingerprints(), before, "Existing EDGE records changed during verification.");
        process.stdout.write(JSON.stringify({
          mode: "applied_and_verified", targetProjectMatched: true, sessionPooler: true,
          tlsVerified: true, migrationsVerified: 6, protectedTablesVerified: edgeTables.length,
          existingEdgeRecordsUnchanged: true, foreignKeysUnchanged: true,
          firmRelationshipOptional: true, credentialsLogged: false,
        }) + "\n");
      } finally {
        // Also clears an unfinished read-only transaction after an audit failure.
        if (!apply) await client.query("ROLLBACK");
        await client.query("SELECT pg_advisory_unlock(hashtext('edge-approved-schema-upgrade'))");
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  const category = typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "CHECK_FAILED";
  process.stderr.write(`General-expenses migration stopped: stage=${stage}; category=${category}. No credentials or database contents logged. Inspect migration history before retrying.\n`);
  process.exitCode = 1;
});
