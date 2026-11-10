import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;
export type ValidationConnection = {
  host: string;
  port: number;
  peerAddress: string | undefined;
  serverAddress: string | null;
  database: string;
  user: string;
};
export type ContainerEvidence = {
  id: string;
  running: boolean;
  image: string;
  addresses: string[];
  publishedPorts: number[];
};
const reasons = {
  PRODUCTION_CONTEXT: "Validation is forbidden on Vercel or in NODE_ENV=production.",
  NONLOCAL_TARGET: "The effective database host and connected TCP peer must both be loopback, or the connection must be a verified Unix socket.",
  UNVERIFIED_SERVER: "PostgreSQL reported a non-loopback server address. Only a verified GitHub-hosted PostgreSQL service container may use a bridge address.",
  CI_SERVICE_MISMATCH: "The CI identity, database, Docker service identity, address or published port did not match the disposable PostgreSQL service.",
  CONTAINER_INSPECTION_FAILED: "Could not inspect this job's running PostgreSQL service container. Check the service ID and Docker availability.",
} as const;
export class ValidationSafetyError extends Error {
  constructor(public readonly code: keyof typeof reasons) { super(reasons[code]); }
}
const normalize = (value: string) => value.toLowerCase().replace(/^::ffff:/, "");
export function isLoopback(value: string | undefined) {
  return value !== undefined && ["127.0.0.1", "::1", "[::1]"].includes(normalize(value));
}
export function isGithubServiceContext(env: Environment) {
  return env.GITHUB_ACTIONS === "true" && env.CI === "true"
    && env.RUNNER_ENVIRONMENT === "github-hosted"
    && env.GITHUB_JOB === "checks"
    && env.GITHUB_REPOSITORY === "AlexCouture00/EDGE-Trading-Intelligence"
    && /^[a-f0-9]{64}$/.test(env.EDGE_VALIDATION_SERVICE_CONTAINER_ID ?? "");
}
export function authorizeValidationConnection(
  connection: ValidationConnection, env: Environment, container?: ContainerEvidence,
) {
  if (env.VERCEL || env.NODE_ENV === "production") throw new ValidationSafetyError("PRODUCTION_CONTEXT");
  if (connection.host.startsWith("/") && !connection.peerAddress && connection.serverAddress === null) {
    return "local-unix-socket";
  }
  if (!(connection.host === "localhost" || isLoopback(connection.host)) || !isLoopback(connection.peerAddress)) {
    throw new ValidationSafetyError("NONLOCAL_TARGET");
  }
  if (isLoopback(connection.serverAddress ?? undefined)) return "local-loopback";
  if (!isGithubServiceContext(env)) throw new ValidationSafetyError("UNVERIFIED_SERVER");
  if (!container || container.id !== env.EDGE_VALIDATION_SERVICE_CONTAINER_ID
    || !container.running || container.image !== "postgres:16"
    || connection.database !== "edge_ci" || connection.user !== "edge_ci"
    || !container.publishedPorts.includes(connection.port)
    || !connection.serverAddress || !isIP(connection.serverAddress)
    || !container.addresses.some((address) => normalize(address) === normalize(connection.serverAddress!))) {
    throw new ValidationSafetyError("CI_SERVICE_MISMATCH");
  }
  return "verified-github-postgres-service";
}

/** Never serialize a driver Error: messages/stacks can contain URLs or SQL. */
export function safeValidationError(error: unknown) {
  if (error instanceof ValidationSafetyError) return { code: error.code, detail: error.message };
  const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const hints: Record<string, string> = {
    "28P01": "Database authentication failed. Check the disposable database credentials securely.",
    "42501": "The local test role lacks a required database/schema privilege.",
    "42P04": "The generated temporary database already exists; no existing database will be overwritten.",
    "3D000": "The requested test database does not exist.",
    ECONNREFUSED: "PostgreSQL is not accepting connections at the configured local endpoint.",
    ENOTFOUND: "The configured database endpoint could not be resolved.",
    ETIMEDOUT: "The database connection timed out.",
    ERR_ASSERTION: "A validation assertion failed; the stage identifies the affected schema or test check.",
  };
  const code = Object.hasOwn(hints, raw) || /^[0-9A-Z]{5}$/.test(raw) ? raw : "UNCLASSIFIED";
  return { code, detail: hints[code] ?? "Validation failed. Raw driver details are suppressed to protect credentials." };
}
