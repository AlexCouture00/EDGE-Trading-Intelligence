---
name: Certificate diagnostics
description: Distinguish PEM formatting failures from invalid CA contents using safe offline checks.
---
Do not assume an unparseable PEM means the user supplied the wrong certificate. Diagnose line separators, envelope, base64, decoded DER and X.509 CA status separately without printing input.

**Why:** The supplied Supabase CA had been flattened onto one line with neither literal nor escaped newlines. Its DER was a valid, current CA, but Node rejected the PEM envelope with `ERR_OSSL_PEM_NO_START_LINE`. Repeated requests to paste it again did not address the actual formatting defect.

**How to apply:** Normalize supported PEM whitespace without changing decoded certificate bytes; retain verified TLS and reject malformed or non-CA input. Offline certificate validity does not prove trust of the configured server; a separate approved connection check is still needed. Do not log certificate content, credentials or raw driver errors.
