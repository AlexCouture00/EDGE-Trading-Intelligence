import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
if (process.argv.includes("--schema")) {
  const { default: Ajv } = await import("ajv");
  const response = await fetch("https://openapi.vercel.sh/vercel.json");
  assert.ok(response.ok, "Could not fetch the official Vercel configuration schema");
  const schema = await response.json();
  // Vercel currently labels this draft-04 but uses numeric exclusiveMinimum
  // (draft-06+). Its keywords used here have draft-07 semantics.
  schema.$schema = "http://json-schema.org/draft-07/schema#";
  const validate = new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile(schema);
  assert.ok(validate(config), JSON.stringify(validate.errors));
  process.stdout.write("vercel.json validates against Vercel's current official JSON schema.\n");
}
assert.deepEqual(Object.keys(config.services).sort(), ["api-server", "edge"]);
for (const key of ["framework", "buildCommand", "installCommand", "outputDirectory", "functions"]) {
  assert.equal(config[key], undefined, `${key} belongs inside a service`);
}
for (const [name, service] of Object.entries(config.services)) {
  assert.equal(service.root, `artifacts/${name}`);
  assert.ok(service.installCommand.includes("--frozen-lockfile"));
  await access(path.join(root, service.root, "package.json"));
}
function serviceFor(url) {
  return config.rewrites.find((route) => new RegExp(`^${route.source}$`).test(url))?.destination.service;
}
for (const url of ["/api", "/api/healthz", "/api/edge/accounts", "/api/edge/trades/id", "/api/auth/session"]) {
  assert.equal(serviceFor(url), "api-server", url);
}
for (const url of ["/", "/performance", "/settings", "/journal", "/trades/id/edit", "/sign-in", "/logo.svg", "/assets/example.js"]) {
  assert.equal(serviceFor(url), "edge", url);
}
assert.equal(config.services["api-server"].entrypoint, "src/app.ts");
assert.deepEqual(config.services.edge.routes, [{ handle: "filesystem" }, { src: "/(.*)", dest: "/index.html" }]);
assert.equal(config.services.edge.outputDirectory, "dist/public");
assert.ok(Object.values(config.services).every((s) => !s.bindings), "Browser API calls need no service bindings");
const out = path.join(root, "artifacts/edge/dist/public");
const html = await readFile(path.join(out, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
  await access(path.join(out, match[1]));
}
const app = await readFile(path.join(root, "artifacts/edge/src/App.tsx"), "utf8");
assert.ok(!app.includes("@clerk/"), "Legacy authentication must not remain in the frontend");
process.stdout.write("Deployment checks passed: service selection, API precedence, SPA fallback, entrypoint, output and built assets. This is not a Vercel cloud deployment test.\n");
