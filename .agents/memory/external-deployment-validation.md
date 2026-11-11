---
name: External deployment validation
description: Non-obvious local PostgreSQL and upstream Vercel schema validation constraints.
---
Check the effective driver endpoint, actual client peer and server-side connection when deciding whether disposable database validation is safe. None of those is sufficient alone.

**Why:** The Replit database proxy connects over private TCP while its upstream PostgreSQL reports a null server address. Conversely, GitHub's loopback Docker port mapping connects to PostgreSQL that reports its container bridge address. A null server address does not prove the client used a Unix socket, and a non-loopback server address does not by itself prove a remote database.

**How to apply:** Require a genuine socket or loopback client connection for local validation. In GitHub-hosted CI, accept the bridge address only after inspecting the exact job-owned PostgreSQL container and verifying its identity, address, image, running state, mapped port and disposable database identity. Do not allow arbitrary private addresses or trust the CI flag alone. For local tests use a disposable local PostgreSQL instance; keep the proxied development database untouched. Only drop the uniquely generated test database.

Vercel's public configuration schema can declare draft-04 while containing numeric `exclusiveMinimum` keywords from newer drafts.

**Why:** A strict draft-04 validator rejects the upstream schema itself, before validating this project's configuration.

**How to apply:** Validate using compatible keyword semantics and document the normalization. Do not skip configuration validation or disable validation errors to hide the mismatch.

GitHub source-control OAuth can permit repository and PR operations while lacking the separate `workflow` scope.

**Why:** A push containing a GitHub Actions workflow was rejected as a whole even though remote fetches and PR inspection worked. Repository access alone does not prove workflow-write access.

**How to apply:** Check current permissions before pushing workflow changes. If GitHub rejects the push for missing scope, retain local commits and request reauthorization with workflow access; do not force-push or strip workflow history without user approval. The source-control connector may report that inline reconnection is unavailable, requiring the user to reconnect through Git-provider settings.

For Vercel's deployment REST API, use explicit `target: "staging"` for Preview and verify the returned identity claims say `environment: "preview"`. Do not send `target: "preview"` or rely on omission.

**Why:** The first deployment of a new linked project was unexpectedly classified as Production when the target was omitted, despite using a feature branch. It was immediately canceled before readiness. The API rejects the literal `preview` target; `staging` returned the Preview environment correctly.

**How to apply:** Fail closed and immediately cancel any request whose returned target or environment is Production when only Preview was authorized. Keep `main` as the Production branch, scope all credentials to the feature branch's Preview environment, and use the actual returned branch alias for exact Clerk authorized origins.
