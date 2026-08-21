# Stage 0: Supabase → PostgreSQL 16 schema plan

Status: **blocked on authoritative production dump**. This is a plan, not a migration. No SQL in this document has been applied.

## Evidence boundary

The repository contains migrations dated `20260804000000` through `20260821000000`, but it does not contain the original `public.projects` creation migration. The current machine has no Supabase CLI, project linkage, database connection string, or database password. Only the public browser URL/key are configured; those cannot produce a complete inventory through RLS.

Consequently:

- production schema, row counts, migration history, grants, extensions, storage contents, and the exact `public.projects` definition are **not yet verified**;
- details below are a repository-derived candidate mapping and must be reconciled against `production-public-schema.sql` and the catalog inventory before any PostgreSQL migration is authored;
- no absent production detail is inferred.

## Target baseline structure

Target PostgreSQL 16 should use these ownership boundaries:

- `public.users`: application identity keyed by the verified KeyDee stable subject. The final key type and columns remain open until the KeyDee `sub` contract is observed.
- application tables in `public`, preserving production column types, defaults, PKs, FKs, unique/check constraints and indexes unless the evidence review records an intentional change;
- every production `user_id → auth.users(id)` FK becomes `user_id → public.users(id)` with the same verified nullability and delete action;
- Supabase `auth.uid()` and Data API RLS policies are not copied as the primary authorization mechanism. The server verifies the KeyDee token, resolves the caller to `public.users`, and applies owner predicates in server-side queries/transactions. Whether defense-in-depth PostgreSQL RLS remains is a Stage 1 design decision;
- Supabase roles/grants (`anon`, `authenticated`, `service_role`) are replaced by least-privilege credentials for application runtime, migrations, and operations;
- `storage.buckets`, `storage.objects`, and storage policies are not recreated in PostgreSQL. Object bytes move to private Timeweb S3; PostgreSQL stores only the application-owned object key and metadata required by the product;
- Supabase migration bookkeeping is archived as evidence. A new clean PostgreSQL baseline starts its own migration history.

## Repository-derived table mapping (provisional)

| Current Supabase object | Target PostgreSQL 16 | Constraint/index treatment |
|---|---|---|
| `public.projects` | `public.projects` | **Unknown until production dump.** Preserve the full production definition. Repo evidence only adds non-null `client_id` and unique index `(user_id, client_id)`; the original columns, PK, FKs, defaults, checks, triggers and grants are absent locally. |
| `public.performers` | same | Preserve UUID PK/default, JSONB payload, timestamps, unique `(user_id, client_id)`, `user_id` index and updated-at trigger; remap auth FK. |
| `public.quick_access_items` | same | Preserve UUID PK/default, both unique constraints, composite FK `(user_id, performer_client_id) → performers(user_id, client_id)` with cascade, owner/sort indexes and updated-at trigger; remap auth FK. |
| `public.template_libraries` | same | Preserve user PK, version, JSONB payload, timestamps and updated-at trigger; remap auth FK. |
| `public.ai_settings` | same | Preserve user PK, text size check, booleans/defaults including `use_studio_templates`, timestamps and trigger; remap auth FK. |
| `public.studio_export_profiles` | same | Preserve user PK, branding columns, JSON object checks, safe-path check, `logo_position` enum-like check, timestamps and trigger behavior as verified; remap auth FK. `logo_asset_path` becomes a private Timeweb S3 object key. |
| `public.export_presets` | same | Preserve UUID PK/default, trimmed name check, JSON object check, timestamps, `(user_id, updated_at desc)` index and verified trigger behavior; remap auth FK. |
| `public.ai_usage_events` | same | Preserve UUID PK/default, token/cost/pricing fields and `(user_id, created_at desc)` index; remap auth FK. Retention period requires an explicit decision. |
| `public.product_events` | same | Preserve UUID PK/default, event/request/session fields, JSONB metadata, owner/time and event-type indexes; remap auth FK. Retention period requires an explicit decision. |
| `public.user_flags` | same | Preserve user PK, beta flag, timestamps and trigger; remap auth FK. |
| `public.ai_usage_limits` | same | Preserve user PK, numeric limit/unlimited defaults, timestamps and trigger; remap auth FK. Writes remain administrative/server-only. |
| `public.beta_feedback` | same if retained | Preserve UUID PK/default, message/context/project/sheet fields and owner/time index; remap auth FK. Retention requires an explicit product decision. |
| Any additional production table | undecided | Must be added from catalog evidence; do not silently omit it. |

## Functions, triggers, policies, extensions and grants

Repo evidence names `public.set_updated_at()` and multiple `*_set_updated_at` triggers. The exact production function body, security mode, owner, grants, every attached trigger, and every installed extension must come from the production dump/catalog. `gen_random_uuid()` also requires verifying whether it is built-in usage or extension-provided in the deployed version.

Supabase RLS policies are evidence for the intended ownership model, not directly portable application authorization. Stage 1 must map every operation to a server authorization test, including ownership checks on SELECT/INSERT/UPDATE/DELETE and administrative-only writes.

## Storage mapping

Repo evidence defines private bucket `export-logos`, 2 MiB limit, and MIME allowlist PNG/JPEG/WebP, with the first path segment equal to the authenticated user UUID. Target: private Timeweb S3 bucket, server-generated object keys, equivalent MIME/size validation, signed reads, and lifecycle/backup policy. Actual bucket definition, policies, object paths, sizes and MIME types remain unverified until production evidence is collected.

## Gate before a migration may be created

1. Obtain and review the production schema-only dump and catalog inventory.
2. Record the exact `public.projects` DDL separately.
3. Reconcile every object above plus any production-only objects.
4. Decide data retention table by table and map Supabase auth users to verified KeyDee subjects.
5. Verify KeyDee issuer, JWKS, algorithm, audience, `sub`, expiry and session/refresh behavior.
6. Decide Timeweb S3 key layout and copy verification strategy from the storage inventory.
7. Only then author and test a PostgreSQL 16 baseline migration in Stage 1.
