---
name: Production hosting requirements
description: User's production hosting choice and data-preservation boundaries for EDGE.
---
EDGE production must deploy to Vercel Services through GitHub, not Replit Cloud. Use the existing Supabase PostgreSQL project with Drizzle. Follow the current authentication requirements in `replit.md`, not the superseded Clerk setup. Replit remains development only and its database must remain intact.

**Why:** The user explicitly specified these hosting requirements.

Preserve all existing schemas, migrations, and data. Do not deploy or migrate data automatically; first audit and report findings. Do not delete or migrate production data without approval. Do not overwrite an existing Git remote or force-push.

**Why:** The user explicitly required audit-first delivery and approval for deployment and data migration.

**How to apply:** Keep actual deployment, database initialization/transfer, and identity migration separate and approval-gated. Review changes and run validation before merging or pushing to main.

The user reports EDGE is working in Vercel Production and wants the Replit workspace on `main` so future small updates can be committed and pushed directly to Production. A push to GitHub `main` triggers the Vercel Production deployment.

**Why:** The user explicitly requested this workflow after the initial feature-branch setup. Vercel's production branch was independently confirmed as `main`.

**How to apply:** Keep Replit on the updated `main` after the approved synchronization. Treat a push to `main` as a live Production deployment, not a Preview-only operation. Preserve the database and environment configuration.

The user reports that their new Supabase project has Data API disabled and SSL enforcement enabled. They require the Session pooler on port 5432 for initialization, a read-only emptiness check first, and separate explicit confirmation before running the initializer.

**Why:** The user specified this initialization process and reported completing the Supabase security configuration; these settings are not independently verified yet.

**How to apply:** Keep the migration connection in `MIGRATION_DATABASE_URL`, never replace the Replit development connection, never seed or copy data, and verify the eight tables and access restrictions after approved initialization.
