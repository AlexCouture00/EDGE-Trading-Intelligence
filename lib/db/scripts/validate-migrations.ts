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
