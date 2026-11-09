---
name: Contract generation
description: Why generated validation schemas and request types must not share a wildcard barrel.
---
Keep server validation exports separate from generated request TypeScript types when generating operations with both path and query parameters.

**Why:** Orval gives query parameter interfaces and path-validation schemas identical names for some operations. Re-exporting both via wildcards produces ambiguous TypeScript exports; regenerating default index files can reintroduce the failure.

**How to apply:** Preserve the manually owned validation-only barrel and disabled automatic Zod index generation. The React client continues to expose its own generated TypeScript interfaces.
