---
name: External deployment validation
description: Non-obvious local PostgreSQL and upstream Vercel schema validation constraints.
---
Check the actual PostgreSQL connection address when deciding whether disposable database validation is safe; URL hostname matching alone is insufficient for local development.

**Why:** This workspace's local PostgreSQL connects through a Unix socket represented in the connection URL in a form that ordinary localhost checks reject. The driver connects successfully and PostgreSQL reports a null server address.

**How to apply:** Permit disposable database creation only after PostgreSQL itself confirms a Unix socket or loopback address. Never relax the check to arbitrary remote hosts, and only drop the uniquely generated test database.

Vercel's public configuration schema can declare draft-04 while containing numeric `exclusiveMinimum` keywords from newer drafts.

**Why:** A strict draft-04 validator rejects the upstream schema itself, before validating this project's configuration.

**How to apply:** Validate using compatible keyword semantics and document the normalization. Do not skip configuration validation or disable validation errors to hide the mismatch.
