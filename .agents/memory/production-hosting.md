---
name: Production hosting requirements
description: User's production hosting choice and data-preservation boundaries for EDGE.
---
EDGE production must deploy to Vercel through GitHub, not Replit Cloud. Prefer an independent managed PostgreSQL provider such as Supabase or Neon.

**Why:** The user explicitly specified these hosting requirements.

Preserve all existing schemas, migrations, and data. Do not deploy or migrate data automatically; first audit and report findings. Do not delete or migrate production data without approval. Do not overwrite an existing Git remote or force-push.

**Why:** The user explicitly required audit-first delivery and approval for deployment and data migration.

**How to apply:** Prepare changes only after the audit has been presented and further work authorized. Keep deployment, database transfer, and identity migration separate from compatibility preparation.
