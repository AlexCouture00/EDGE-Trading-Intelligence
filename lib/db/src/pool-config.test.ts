import { test } from "node:test";
import assert from "node:assert/strict";
import { databasePoolConfig } from "./pool-config";

// Deliberately synthetic URLs; no credentials from the environment are read.
const local = "postgresql://localhost/edge_test";
const remote = "postgresql://postgres.project:fake@aws-0-region.pooler.supabase.com:6543/postgres";

test("local PostgreSQL remains usable without TLS or Vercel variables", () => {
  const config = databasePoolConfig({ DATABASE_URL: local });
  assert.equal(config.ssl, undefined);
  assert.equal(config.connectionString, local);
});
test("Vercel uses a bounded, verified-TLS pool with short idle timeout", () => {
  const config = databasePoolConfig({ VERCEL: "1", DATABASE_URL: `${remote}?sslmode=require` });
  assert.equal(config.max, 3);
  assert.equal(config.idleTimeoutMillis, 5000);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.ok(!config.connectionString?.includes("sslmode"));
});
test("TLS certificate supplied as escaped PEM is normalized", () => {
  assert.deepEqual(databasePoolConfig({ DATABASE_URL: remote, DATABASE_SSL_CA: "first\\nsecond" }).ssl,
    { rejectUnauthorized: true, ca: "first\nsecond" });
});
test("Vercel rejects local databases, direct connections and disabled TLS", () => {
  for (const DATABASE_URL of [local, remote.replace(":6543", ":5432"), `${remote}?sslmode=disable`]) {
    assert.throws(() => databasePoolConfig({ VERCEL: "1", DATABASE_URL }));
  }
});
test("pool configuration rejects zero, unbounded or invalid sizes", () => {
  for (const DATABASE_POOL_MAX of ["0", "-1", "100", "NaN", "1.5"]) {
    assert.throws(() => databasePoolConfig({ DATABASE_URL: local, DATABASE_POOL_MAX }));
  }
});
test("migrations require their own session URL and cannot silently use the development database", () => {
  assert.throws(() => databasePoolConfig({ DATABASE_URL: local }, true));
  assert.throws(() => databasePoolConfig({ MIGRATION_DATABASE_URL: remote }, true));
  assert.equal(databasePoolConfig({ MIGRATION_DATABASE_URL: remote.replace(":6543", ":5432") }, true).max, 1);
});
