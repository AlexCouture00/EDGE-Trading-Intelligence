import { test } from "node:test";
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { normalizeDatabaseCa } from "./certificate";

// Public, bundled Node trust roots, never environment secrets or live connections.
const pem = rootCertificates[0];
const canonical = normalizeDatabaseCa(pem);

test("normalizes literal, escaped and flattened PEM without changing X.509 bytes", () => {
  for (const value of [
    pem, pem.replace(/\n/g, "\r\n"), pem.replace(/\n/g, "\\n"),
    pem.replace(/\n/g, "\\r\\n"), pem.replace(/\r?\n/g, ""),
    pem.replace(/\r?\n/g, " "), `\uFEFF  ${pem}  `,
  ]) {
    const result = normalizeDatabaseCa(value);
    assert.equal(result, canonical);
    const cert = new X509Certificate(result);
    assert.equal(cert.ca, true);
    assert.deepEqual(cert.raw, new X509Certificate(pem).raw);
  }
});

test("supports CA bundles and is idempotent", () => {
  const bundle = normalizeDatabaseCa(`${pem}\n${rootCertificates[1]}`);
  assert.equal((bundle.match(/-----BEGIN CERTIFICATE-----/g) || []).length, 2);
  assert.equal(normalizeDatabaseCa(bundle), bundle);
});

test("rejects malformed envelopes, invalid base64, invalid DER and extraneous input safely", () => {
  for (const value of [
    "", "not-a-certificate", pem.replace("BEGIN CERTIFICATE", "BEGIN PRIVATE KEY"),
    pem.replace("END CERTIFICATE", "END INVALID"),
    "-----BEGIN CERTIFICATE-----\n!!!!\n-----END CERTIFICATE-----",
    "-----BEGIN CERTIFICATE-----\nYQ==\n-----END CERTIFICATE-----",
    "-----BEGIN CERTIFICATE-----\nYR==\n-----END CERTIFICATE-----",
    `${pem}\nDO_NOT_EXPOSE_SENTINEL`, `"${pem}"`,
  ]) {
    assert.throws(() => normalizeDatabaseCa(value),
      { message: "DATABASE_SSL_CA must contain valid PEM CA certificates only." });
  }
});
