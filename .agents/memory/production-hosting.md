---
name: Production hosting requirements
description: User's production hosting choice and data-preservation boundaries for EDGE.
---
EDGE production must deploy to Vercel Services through GitHub, not Replit Cloud. Use Supabase strictly as managed PostgreSQL with the existing Drizzle ORM; keep Clerk, not Supabase Auth. Replit remains development only and its database must remain intact.

**Why:** The user explicitly specified these hosting requirements.

Preserve all existing schemas, migrations, and data. Do not deploy or migrate data automatically; first audit and report findings. Do not delete or migrate production data without approval. Do not overwrite an existing Git remote or force-push.

**Why:** The user explicitly required audit-first delivery and approval for deployment and data migration.

**How to apply:** Compatibility implementation is authorized, preserving the premium interface and existing features. Keep actual deployment, database initialization/transfer, and identity migration separate and approval-gated. Review the existing Vercel feature branch and draft pull request before Git changes; do not merge main before review and testing.
