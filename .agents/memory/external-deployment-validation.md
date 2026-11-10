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

GitHub source-control OAuth can permit repository and PR operations while lacking the separate `workflow` scope.

**Why:** A push containing a GitHub Actions workflow was rejected as a whole even though remote fetches and PR inspection worked. Repository access alone does not prove workflow-write access.

**How to apply:** Check current permissions before pushing workflow changes. If GitHub rejects the push for missing scope, retain local commits and request reauthorization with workflow access; do not force-push or strip workflow history without user approval. The source-control connector may report that inline reconnection is unavailable, requiring the user to reconnect through Git-provider settings.
