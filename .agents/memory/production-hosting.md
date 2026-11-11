---
name: Production hosting requirements
description: User's production hosting choice and data-preservation boundaries for EDGE.
---
EDGE production must deploy to Vercel Services through GitHub, not Replit Cloud. Use the existing Supabase PostgreSQL project with Drizzle. Follow the current authentication requirements in `replit.md`, not the superseded Clerk setup. Replit remains development only and its database must remain intact.

**Why:** The user explicitly specified these hosting requirements.

Preserve all existing schemas, migrations, and data. Do not deploy or migrate data automatically; first audit and report findings. Do not delete or migrate production data without approval. Do not overwrite an existing Git remote or force-push.

**Why:** The user explicitly required audit-first delivery and approval for deployment and data migration.

**How to apply:** Compatibility implementation is authorized, preserving the premium interface and existing features. Keep actual deployment, database initialization/transfer, and identity migration separate and approval-gated. Review the existing Vercel feature branch and draft pull request before Git changes; do not merge main before review and testing.

The user reports that their new Supabase project has Data API disabled and SSL enforcement enabled. They require the Session pooler on port 5432 for initialization, a read-only emptiness check first, and separate explicit confirmation before running the initializer.

**Why:** The user specified this initialization process and reported completing the Supabase security configuration; these settings are not independently verified yet.

**How to apply:** Keep the migration connection in `MIGRATION_DATABASE_URL`, never replace the Replit development connection, never seed or copy data, and verify the eight tables and access restrictions after approved initialization.
