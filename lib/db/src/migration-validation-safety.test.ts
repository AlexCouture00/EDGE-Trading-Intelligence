import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeValidationConnection, safeValidationError, ValidationSafetyError,
  type ValidationConnection, type ContainerEvidence,
} from "./migration-validation-safety";

const id = "a".repeat(64);
const ci = { CI: "true", GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_JOB: "checks", GITHUB_REPOSITORY: "AlexCouture00/EDGE-Trading-Intelligence",
  EDGE_VALIDATION_SERVICE_CONTAINER_ID: id };
const tcp: ValidationConnection = {
  host: "localhost", port: 5432, peerAddress: "127.0.0.1",
  serverAddress: "127.0.0.1", database: "edge_ci", user: "edge_ci",
};
const docker = { ...tcp, serverAddress: "172.17.0.2" };
const evidence: ContainerEvidence = {
  id, running: true, image: "postgres:16", addresses: ["172.17.0.2"], publishedPorts: [5432],
};
test("local Unix socket and loopback PostgreSQL remain supported", () => {
  assert.equal(authorizeValidationConnection({ ...tcp, host: "/var/run/postgresql", peerAddress: undefined, serverAddress: null }, {}), "local-unix-socket");
  assert.equal(authorizeValidationConnection(tcp, {}), "local-loopback");
  assert.equal(authorizeValidationConnection({ ...tcp, host: "::1", peerAddress: "::1", serverAddress: "::1" }, {}), "local-loopback");
  assert.equal(authorizeValidationConnection({ ...tcp, peerAddress: "::ffff:127.0.0.1" }, {}), "local-loopback");
});
test("GitHub Docker NAT regression requires exact local Docker service evidence", () => {
  assert.equal(authorizeValidationConnection(docker, ci, evidence), "verified-github-postgres-service");
});
test("a private address, localhost spelling or CI flag alone never authorizes a remote server", () => {
  for (const env of [{}, { CI: "true" }, { GITHUB_ACTIONS: "true" }, { ...ci, RUNNER_ENVIRONMENT: "self-hosted" }]) {
    assert.throws(() => authorizeValidationConnection(docker, env, evidence), ValidationSafetyError);
  }
  assert.throws(() => authorizeValidationConnection(docker, ci), /did not match/);
  assert.throws(() => authorizeValidationConnection({ ...docker, host: "db.example.com" }, ci, evidence), /effective database host/);
  assert.throws(() => authorizeValidationConnection({ ...docker, peerAddress: "203.0.113.1" }, ci, evidence), /effective database host/);
});
test("Docker proof must match image, running state, container ID, server IP and mapped port", () => {
  for (const container of [
    { ...evidence, id: "b".repeat(64) }, { ...evidence, running: false },
    { ...evidence, image: "postgres:latest" }, { ...evidence, addresses: ["172.17.0.3"] },
    { ...evidence, publishedPorts: [6543] },
  ]) assert.throws(() => authorizeValidationConnection(docker, ci, container), /did not match/);
});
test("CI exception is restricted to the expected job, repository and disposable database identity", () => {
  for (const env of [
    { ...ci, GITHUB_JOB: "deploy" }, { ...ci, GITHUB_REPOSITORY: "another/repository" },
    { ...ci, EDGE_VALIDATION_SERVICE_CONTAINER_ID: "--unsafe" },
  ]) assert.throws(() => authorizeValidationConnection(docker, env, evidence));
  for (const connection of [{ ...docker, database: "production" }, { ...docker, user: "postgres" }]) {
    assert.throws(() => authorizeValidationConnection(connection, ci, evidence));
  }
});
test("production and Vercel contexts are refused even with otherwise valid Docker evidence", () => {
  for (const env of [{ ...ci, NODE_ENV: "production" }, { ...ci, VERCEL: "1" }]) {
    assert.throws(() => authorizeValidationConnection(docker, env, evidence), /forbidden/);
    assert.throws(() => authorizeValidationConnection(tcp, env), /forbidden/);
  }
});
test("diagnostics retain safe reasons/SQLSTATE but never raw driver messages or stacks", () => {
  const unsafe = Object.assign(new Error("postgresql://user:SENSITIVE@example.com/private"), { code: "28P01" });
  const formatted = JSON.stringify(safeValidationError(unsafe));
  assert.ok(formatted.includes("28P01"));
  assert.ok(!formatted.includes("SENSITIVE") && !formatted.includes("example.com"));
  assert.equal(safeValidationError(new Error("SENSITIVE")).code, "UNCLASSIFIED");
  assert.equal(safeValidationError(new ValidationSafetyError("NONLOCAL_TARGET")).code, "NONLOCAL_TARGET");
  assert.equal(safeValidationError({ code: "__proto__", message: "SENSITIVE" }).code, "UNCLASSIFIED");
});
