import { test } from "node:test";
import assert from "node:assert/strict";
import { externalClerkOptions } from "./auth-options";

const env = {
  CLERK_PUBLISHABLE_KEY: "synthetic-publishable",
  CLERK_SECRET_KEY: "synthetic-secret",
  CLERK_AUTHORIZED_PARTIES: "https://edge.example.com,https://preview.example.com",
};
test("external Clerk preserves exact allowed origins and server-only credentials", () => {
  const config = externalClerkOptions(env);
  assert.deepEqual(config.authorizedParties, ["https://edge.example.com", "https://preview.example.com"]);
  assert.equal(config.secretKey, env.CLERK_SECRET_KEY);
});
test("production authentication fails explicitly when keys or authorized parties are missing", () => {
  assert.throws(() => externalClerkOptions({ ...env, CLERK_SECRET_KEY: undefined }));
  assert.throws(() => externalClerkOptions({ ...env, CLERK_PUBLISHABLE_KEY: undefined }));
  assert.throws(() => externalClerkOptions({ ...env, CLERK_AUTHORIZED_PARTIES: "" }));
});
test("production authorized parties cannot include insecure URLs, paths, credentials or wildcards", () => {
  for (const origin of ["http://edge.example.com", "https://edge.example.com/", "https://user:pass@edge.example.com",
    "https://edge.example.com/path", "*.example.com", "https://*.example.com"]) {
    assert.throws(() => externalClerkOptions({ ...env, CLERK_AUTHORIZED_PARTIES: origin }));
  }
});
