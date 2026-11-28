import pg from "pg";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { databasePoolConfig } from "../src/pool-config";
import { edgeTables, initializeEmptyDatabase, migrationsFolder } from "./migration-helpers";
import {
  authorizeValidationConnection, isGithubServiceContext, isLoopback,
  safeValidationError, ValidationSafetyError, type ContainerEvidence,
} from "../src/migration-validation-safety";
import { isIP } from "node:net";

function reportFailure(failedStage: string, error: unknown) {
  process.stderr.write(`${JSON.stringify({ event: "migration_validation_failed", stage: failedStage, ...safeValidationError(error) })}\n`);
}

function inspectGithubService(): ContainerEvidence | undefined {
  if (!isGithubServiceContext(process.env)) return undefined;
  // No shell, no arbitrary executable/arguments, and never log Docker output:
  // inspect also contains the container's password environment variables.
  const result = spawnSync("docker", ["inspect", process.env.EDGE_VALIDATION_SERVICE_CONTAINER_ID!], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 1_048_576,
  });
  if (result.status !== 0) throw new ValidationSafetyError("CONTAINER_INSPECTION_FAILED");
  try {
    const [container] = JSON.parse(result.stdout) as Array<{
      Id: string; State?: { Running?: boolean }; Config?: { Image?: string };
      NetworkSettings?: {
        Networks?: Record<string, { IPAddress?: string; GlobalIPv6Address?: string }>;
        Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
      };
    }>;
    const networks = Object.values(container.NetworkSettings?.Networks ?? {});
    return {
      id: container.Id,
      running: container.State?.Running === true,
      image: container.Config?.Image ?? "",
      addresses: networks.flatMap((network) => [network.IPAddress, network.GlobalIPv6Address])
        .filter((address): address is string => typeof address === "string" && isIP(address) !== 0),
      publishedPorts: (container.NetworkSettings?.Ports?.["5432/tcp"] ?? [])
        .filter((binding) => ["0.0.0.0", "::", "127.0.0.1", "::1"].includes(binding.HostIp ?? ""))
        .map((binding) => Number(binding.HostPort)).filter(Number.isInteger),
    };
  } catch {
    throw new ValidationSafetyError("CONTAINER_INSPECTION_FAILED");
  }
}

let stage = "checking local development connection";
async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new ValidationSafetyError("PRODUCTION_CONTEXT");
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  const admin = new pg.Pool(databasePoolConfig(process.env));
  const name = `edge_validation_${randomUUID().replaceAll("-", "")}`;
  let created = false;
  let isolated: pg.Pool | undefined;
  try {
    stage = "connecting to local validation database";
    const probe = await admin.connect();
    try {
      // Server address can be a Docker bridge IP behind a loopback published
      // port. Check effective pg settings AND the actual client-side TCP peer.
      const metadata = probe as unknown as {
        connectionParameters: { host: string; port: number };
        connection: { stream: { remoteAddress?: string } };
      };
      const result = await probe.query<{ server_address: string | null; database: string; user: string }>(
        "SELECT host(inet_server_addr()) AS server_address, current_database() AS database, current_user AS user",
      );
      const info = result.rows[0]!;
      const host = metadata.connectionParameters.host;
      const peerAddress = metadata.connection.stream.remoteAddress;
      process.stdout.write(`${JSON.stringify({
        event: "migration_validation_connection",
        targetTransport: host.startsWith("/") ? "unix-socket" : "tcp",
        targetHostClass: host.startsWith("/") ? "unix-socket" : host === "localhost" || isLoopback(host) ? "loopback" : "nonlocal",
        targetPort: Number(metadata.connectionParameters.port),
        peerAddress: peerAddress && isIP(peerAddress) ? peerAddress : null,
        serverAddress: info.server_address && isIP(info.server_address) ? info.server_address : null,
        githubServiceContext: isGithubServiceContext(process.env),
        disposableCiIdentity: info.database === "edge_ci" && info.user === "edge_ci",
      })}\n`);
      stage = "authorizing local validation connection";
      const mode = authorizeValidationConnection({
        host, port: Number(metadata.connectionParameters.port), peerAddress,
        serverAddress: info.server_address, database: info.database, user: info.user,
      }, process.env, inspectGithubService());
      process.stdout.write(`${JSON.stringify({ event: "migration_validation_authorized", mode })}\n`);
    } finally { probe.release(); }
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
      assert.equal(constraints.rows[0].n, 14);
      const journal = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      const migrationEntries = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")).entries as { when: number; tag: string }[];
      const expected = migrationEntries.length;
      assert.equal(journal.rows[0].n, expected);
      await migrate(drizzle(client), { migrationsFolder });
      const rerun = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      assert.equal(rerun.rows[0].n, expected);
      await assert.rejects(initializeEmptyDatabase(client), /not a new empty database/);
      stage = "checking additive upgrade preserves existing journal data";
      // Simulate the already-initialized release in this disposable database.
      // Never downgrade or run this fixture setup on the real Supabase project.
      // Recreate the pre-prop-manager release, not merely "latest minus one".
      // These destructive fixture operations only run in the disposable database.
      await client.query("ALTER TABLE public.edge_trades DROP COLUMN volatility");
      await client.query("ALTER TABLE public.edge_trades DROP COLUMN mfe_r");
      for (const table of ["edge_prop_balances", "edge_prop_challenges", "edge_prop_rules", "edge_prop_expenses", "edge_prop_payouts", "edge_prop_accounts", "edge_prop_firms"]) {
        await client.query(`DROP TABLE public.${table}`);
      }
      await client.query("DELETE FROM drizzle.__drizzle_migrations WHERE created_at > $1", [migrationEntries[1]!.when]);
      const canary = await client.query(
        `INSERT INTO public.edge_accounts(owner_id,name,currency,initial_balance,type)
         VALUES ('migration-upgrade-fixture','Preserve existing account','USD','1234.56','backtesting') RETURNING *`,
      );
      const tradeCanary = await client.query(
        `INSERT INTO public.edge_trades(owner_id,account_id,symbol,regime,pnl_source,realized_r)
         VALUES ('migration-upgrade-fixture',$1,'PRESERVE','News-driven','r',2) RETURNING *`,
        [canary.rows[0].id],
      );
      const oldTrade = await client.query("SELECT to_jsonb(t) AS original FROM public.edge_trades t WHERE id=$1", [tradeCanary.rows[0].id]);
      await migrate(drizzle(client), { migrationsFolder });
      const preserved = await client.query("SELECT * FROM public.edge_accounts WHERE id=$1", [canary.rows[0].id]);
      assert.deepEqual(preserved.rows, canary.rows);
      const preservedTrade = await client.query("SELECT to_jsonb(t)-'volatility'-'mfe_r' AS original, volatility, mfe_r FROM public.edge_trades t WHERE id=$1", [tradeCanary.rows[0].id]);
      assert.deepEqual(preservedTrade.rows[0].original, oldTrade.rows[0].original);
      assert.equal(preservedTrade.rows[0].volatility, null);
      assert.equal(preservedTrade.rows[0].mfe_r, null);
      const mfeColumn = await client.query("SELECT data_type,is_nullable,column_default,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name='edge_trades' AND column_name='mfe_r'");
      assert.deepEqual(mfeColumn.rows, [{ data_type: "numeric", is_nullable: "YES", column_default: null, numeric_precision: 28, numeric_scale: 8 }]);
      const volatilityColumn = await client.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='edge_trades' AND column_name='volatility'");
      assert.deepEqual(volatilityColumn.rows, [{ data_type: "text", is_nullable: "YES", column_default: null }]);
      const notesSecurity = await client.query(
        `SELECT relrowsecurity, NOT EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(relacl, acldefault('r',relowner))) a WHERE a.grantee=0
         ) AS no_public_grants FROM pg_class WHERE oid='public.edge_day_notes'::regclass`,
      );
      assert.equal(notesSecurity.rows[0].relrowsecurity, true);
      assert.equal(notesSecurity.rows[0].no_public_grants, true);
      for (const table of edgeTables.filter(name => name.startsWith("edge_prop_"))) {
        const security = await client.query(
          `SELECT relrowsecurity, NOT EXISTS (
             SELECT 1 FROM aclexplode(COALESCE(relacl, acldefault('r',relowner))) a
             LEFT JOIN pg_roles r ON r.oid=a.grantee
             WHERE a.grantee=0 OR r.rolname IN ('anon','authenticated')
           ) AS direct_access_revoked
           FROM pg_class WHERE oid=$1::regclass`, [`public.${table}`],
        );
        assert.equal(security.rows[0].relrowsecurity, true);
        assert.equal(security.rows[0].direct_access_revoked, true);
      }
      // Simulate an existing firm-linked expense before the general-expenses
      // upgrade. These fixture changes are only in this disposable database.
      const expenseFirm = await client.query(
        "INSERT INTO public.edge_prop_firms(owner_id,data) VALUES ('migration-expense-fixture','{}') RETURNING *",
      );
      const expenseCanary = await client.query(
        "INSERT INTO public.edge_prop_expenses(owner_id,firm_id,data) VALUES ('migration-expense-fixture',$1,$2) RETURNING *",
        [expenseFirm.rows[0].id, { firmId: expenseFirm.rows[0].id, accountId: null, category: "other", amount: "12.34", currency: "USD", date: "2026-11-01", notes: "Preserve exactly" }],
      );
      await client.query("ALTER TABLE public.edge_prop_expenses ALTER COLUMN firm_id SET NOT NULL");
      const generalExpensesUpgrade = migrationEntries.find(entry => entry.tag === "0005_aberrant_nextwave");
      assert.ok(generalExpensesUpgrade, "General-expenses migration must be registered");
      await client.query("DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= $1", [generalExpensesUpgrade.when]);
      await migrate(drizzle(client), { migrationsFolder });
      assert.deepEqual((await client.query("SELECT * FROM public.edge_prop_expenses WHERE id=$1", [expenseCanary.rows[0].id])).rows, expenseCanary.rows);
      const expenseColumn = await client.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='edge_prop_expenses' AND column_name='firm_id'");
      assert.deepEqual(expenseColumn.rows, [{ is_nullable: "YES" }]);
      await client.query("DELETE FROM public.edge_prop_expenses WHERE id=$1", [expenseCanary.rows[0].id]);
      await client.query("DELETE FROM public.edge_prop_firms WHERE id=$1", [expenseFirm.rows[0].id]);
      const upgradeJournal = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      assert.equal(upgradeJournal.rows[0].n, expected);
      await client.query("DELETE FROM public.edge_trades WHERE id=$1", [tradeCanary.rows[0].id]);
      await client.query("DELETE FROM public.edge_accounts WHERE id=$1", [canary.rows[0].id]);
    } finally { client.release(); }
    // Run the actual financial/ownership suite against this separate DB.
    stage = "running API tests on isolated database";
    const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "run", "test"], {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "inherit",
    });
    assert.equal(result.status, 0, "API tests against isolated migrated database failed");
    process.stdout.write(`Migration validation passed: ${edgeTables.length} tables, 14 foreign keys, RLS, empty data, journal, repeat safety, additive upgrade preservation and API tests.\n`);
  } catch (error) {
    reportFailure(stage, error);
    process.exitCode = 1;
  } finally {
    try {
      await isolated?.end();
      if (created) await admin.query(`DROP DATABASE "${name}"`);
    } catch (error) {
      reportFailure("cleaning up generated temporary database", error);
      process.exitCode = 1;
    } finally {
      try { await admin.end(); } catch (error) {
        reportFailure("closing validation connection pool", error);
        process.exitCode = 1;
      }
    }
  }
}
main().catch((error: unknown) => {
  reportFailure(stage, error);
  process.exitCode = 1;
});
