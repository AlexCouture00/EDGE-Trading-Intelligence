import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import express from "express";
import { supabaseAuthOptions } from "./auth-options";
import { AuthFailure, createPrivateVerifier, privateSessionMiddleware } from "./private-auth";

const owner = randomUUID(), other = randomUUID();
const config = { url: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co", publishableKey: "sb_publishable_test", allowedUserId: owner };
const secret = randomBytes(32);
async function token(subject = owner, changes: Record<string, unknown> = {}, key = secret) {
  return new SignJWT({ role: "authenticated", ...changes }).setProtectedHeader({ alg: "HS256" })
    .setSubject(subject).setIssuer(config.url + "/auth/v1").setAudience("authenticated")
    .setIssuedAt().setExpirationTime("5m").sign(key);
}
const verified = createPrivateVerifier(config, async value => {
  try {
    const { payload } = await jwtVerify(value, secret);
    return { user: { id: payload.sub!, email: "owner@example.com", is_anonymous: false } };
  } catch { return { user: null, status: 401 }; }
});
const denied = (status: number) => (e: unknown) => e instanceof AuthFailure && e.status === status;

test("single-user configuration fails closed and never accepts privileged keys or owner lists", () => {
  const env = { SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: config.publishableKey, EDGE_AUTHORIZED_USER_ID: owner };
  assert.equal(supabaseAuthOptions(env).allowedUserId, owner);
  for (const change of [
    { SUPABASE_URL: "http://localhost" }, { SUPABASE_URL: config.url + "/" },
    { SUPABASE_URL: config.url + "/evil" }, { SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" },
    { EDGE_AUTHORIZED_USER_ID: "" }, { EDGE_AUTHORIZED_USER_ID: owner + "," + other },
  ]) assert.throws(() => supabaseAuthOptions({ ...env, ...change }));
});
test("verified owner accepted; other real authenticated subject rejected with 403", async () => {
  assert.equal((await verified("Bearer " + await token())).id, owner);
  await assert.rejects(verified("Bearer " + await token(other)), denied(403));
});
test("missing, malformed, forged and expired tokens rejected with 401", async () => {
  await assert.rejects(verified(undefined), denied(401));
  await assert.rejects(verified("Bearer not-a-jwt"), denied(401));
  await assert.rejects(verified("Bearer " + await token(owner, {}, randomBytes(32))), denied(401));
  const expired = await new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" })
    .setSubject(owner).setIssuer(config.url + "/auth/v1").setAudience("authenticated")
    .setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(secret);
  await assert.rejects(verified("Bearer " + expired), denied(401));
});
test("signature verification is not enough: wrong issuer, audience and role are rejected", async () => {
  for (const [claim, value] of [["iss", "https://wrong.supabase.co/auth/v1"], ["aud", "anon"], ["role", "service_role"]]) {
    const jwt = await new SignJWT({ sub: owner, iss: config.url + "/auth/v1", aud: "authenticated",
      role: "authenticated", [claim]: value }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(secret);
    await assert.rejects(verified("Bearer " + jwt), denied(401));
  }
});
test("provider failures and subject mismatch cannot authorize a request", async () => {
  const jwt = "Bearer " + await token();
  await assert.rejects(createPrivateVerifier(config, async () => { throw new Error("offline"); })(jwt), denied(503));
  await assert.rejects(createPrivateVerifier(config, async () => ({ user: null, status: 503 }))(jwt), denied(503));
  await assert.rejects(createPrivateVerifier(config, async () => ({ user: { id: other } }))(jwt), denied(401));
  await assert.rejects(createPrivateVerifier(config, async () => ({ user: { id: owner, is_anonymous: true } }))(jwt), denied(401));
});
test("every private HTTP method rejects non-owner before a handler can change state", async () => {
  const app = express(); let writes = 0;
  app.use("/api/edge", privateSessionMiddleware(verified));
  app.all("/api/edge/test", (_req, res) => { writes++; res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/edge/test`;
    const deniedToken = await token(other);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const r = await fetch(url, { method, headers: { Authorization: "Bearer " + deniedToken } });
      assert.equal(r.status, 403); assert.equal(r.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(writes, 0);
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: "Bearer " + await token() } })).status, 200);
    assert.equal(writes, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
