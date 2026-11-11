import { X509Certificate } from "node:crypto";

/** Normalize public CA PEM formatting without changing certificate bytes or trust. */
export function normalizeDatabaseCa(value: string): string {
  const input = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n").trim();
  const pattern = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  const matches = [...input.matchAll(pattern)];
  const invalid = () => new Error("DATABASE_SSL_CA must contain valid PEM CA certificates only.");
  if (!matches.length || input.replace(pattern, "").trim()) throw invalid();

  return matches.map((match) => {
    const base64 = match[1].replace(/\s/g, "");
    if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw invalid();
    }
    const der = Buffer.from(base64, "base64");
    if (der.toString("base64") !== base64) throw invalid();
    try {
      if (!new X509Certificate(der).ca) throw invalid();
    } catch {
      // Never include the input or the raw OpenSSL exception in diagnostics.
      throw invalid();
    }
    return `-----BEGIN CERTIFICATE-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
  }).join("");
}
