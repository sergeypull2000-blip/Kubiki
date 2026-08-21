# Stage 0: Supabase → PostgreSQL 16 schema plan

Status: **Stage 0 architecture baseline complete**. Production database/storage evidence and greenfield retention are resolved. Better Auth replaces KeyDee and Supabase Auth. This is a plan, not a migration; no SQL has been applied.

## Authoritative evidence and retention boundary

The owner collected production evidence through Supabase SQL Editor and confirmed the production public tables:

`ai_settings`, `ai_usage_events`, `ai_usage_limits`, `beta_feedback`, `export_presets`, `performers`, `product_events`, `profiles`, `projects`, `quick_access_items`, `studio_export_profiles`, `template_libraries`, and `user_flags`.

There are no real production users. Every current application row, Supabase Auth user, `profiles` row, and Storage object is owner development/test data. The target is greenfield:

- do not migrate any existing application rows;
- do not migrate Supabase Auth users or create an old-user identity map;
- do not migrate `public.profiles` or reproduce it as a target table;
- do not copy `export-logos` objects;
- start `public.users`, every target application table, and Timeweb S3 empty;
- leave the old Supabase/Vercel environment unchanged during the rollback/reference window. This retention decision is not permission to delete old data.

## Target baseline structure

- PostgreSQL 16, with application tables in `public`.
- Better Auth and Kubiki application data share the same Timeweb Managed PostgreSQL 16 database.
- Better Auth owns its tables in a dedicated `auth` PostgreSQL schema. Kubiki does not implement passwords, sessions, reset tokens, verification tokens or other authentication primitives itself.
- Better Auth's core `auth.user` is the authentication identity. Configure Better Auth's PostgreSQL ID strategy explicitly as UUID so the application ownership FKs remain compatible with the existing UUID model.
- `public.users` is a thin application identity root: `id uuid PRIMARY KEY` and 1:1 FK `id → auth.user(id) ON DELETE CASCADE`, plus only application-owned lifecycle/profile fields actually justified in Stage 1. It contains no password, credential, session, reset or verification state.
- Every business table references `public.users(id)`, never Better Auth `auth.session`, `auth.account`, or `auth.verification`. This isolates business ownership from framework session/account internals while preserving database referential integrity through `public.users → auth.user`.
- Every application `user_id → auth.users(id)` FK becomes `user_id → public.users(id)`, preserving verified nullability and `ON DELETE CASCADE` behavior.
- The Kubiki Node backend restores/validates the Better Auth session using framework APIs, takes the authenticated Better Auth user ID as the sole ownership identity, and applies owner-scoped authorization. Runtime queries must constrain ownership; database roles use least privilege. Defense-in-depth target RLS remains a Stage 1 implementation decision, not a substitute for server checks.
- Supabase roles/grants and migration bookkeeping are not copied into the clean baseline.
- Supabase Storage schemas are not recreated. Private export logos use empty Timeweb S3 storage with equivalent server-side size/MIME/path authorization.

## Exact authoritative `public.projects`

Current Supabase:

| Column | Definition |
|---|---|
| `id` | `uuid NOT NULL DEFAULT gen_random_uuid()`, primary key |
| `user_id` | `uuid NOT NULL`, FK to `auth.users(id) ON DELETE CASCADE` |
| `name` | `text NOT NULL DEFAULT 'Без названия'` |
| `data_version` | `integer NOT NULL DEFAULT 1` |
| `project_data` | `jsonb NOT NULL DEFAULT '{}'::jsonb` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` |
| `client_id` | `text NOT NULL` |

Constraints/indexes:

- `projects_pkey` on `id`;
- FK `user_id → auth.users(id) ON DELETE CASCADE`;
- unique `(user_id, client_id)`, implemented by `projects_user_id_client_id_key`;
- `projects_updated_at_idx(updated_at DESC)`;
- `projects_user_id_idx(user_id)`;
- `projects_set_updated_at` trigger calling `public.set_updated_at()` before update.

Target PostgreSQL 16 preserves all columns, defaults, PK, uniqueness, ordinary indexes and updated-at behavior. Only the FK target changes to `public.users(id)`.

## Table-by-table target mapping

The ordinary PostgreSQL columns, defaults, constraints and indexes supplied in owner evidence and repository migrations are retained unless explicitly replaced below.

| Current Supabase object | Target PostgreSQL 16 |
|---|---|
| `public.profiles` | Removed. Do not migrate rows. Minimal application identity responsibility moves to `public.users`, linked 1:1 to Better Auth `auth.user`. |
| `public.projects` | Preserve exact definition above; remap auth FK; start empty. |
| `public.performers` | Preserve UUID PK/default, payload, timestamps, unique `(user_id, client_id)`, owner index and updated-at trigger; remap auth FK; start empty. |
| `public.quick_access_items` | Preserve UUID PK/default, unique owner/client and owner/performer constraints, owner/sort indexes, updated-at trigger, and composite FK `(user_id, performer_client_id) → performers(user_id, client_id) ON DELETE CASCADE`; remap auth FK; start empty. |
| `public.template_libraries` | Preserve user PK, version, JSONB payload, timestamps and trigger; remap auth FK; start empty. |
| `public.ai_settings` | Preserve user PK, personalization size check, boolean defaults including `use_studio_templates`, timestamps and trigger; remap auth FK; start empty. |
| `public.studio_export_profiles` | Preserve user PK, branding columns, JSON-object checks, safe object-path check, logo-position check and timestamps; remap auth FK; start empty. `logo_asset_path` refers only to new Timeweb S3 objects. |
| `public.export_presets` | Preserve UUID PK/default, trimmed-name and JSON-object checks, timestamps and `(user_id, updated_at DESC)` index; remap auth FK; start empty. |
| `public.ai_usage_events` | Preserve UUID PK/default, usage/pricing columns and `(user_id, created_at DESC)` index; remap auth FK; start empty. |
| `public.product_events` | Preserve UUID PK/default, event/request/session fields, JSONB metadata, owner/time and event-type indexes; remap auth FK; start empty. |
| `public.user_flags` | Preserve user PK, beta flag, timestamps and updated-at trigger; remap auth FK; start empty. |
| `public.ai_usage_limits` | Preserve user PK, numeric limit/unlimited defaults, timestamps, administrative write model and updated-at trigger; remap auth FK; start empty. |
| `public.beta_feedback` | Preserve UUID PK/default, message/context/project/sheet fields and owner/time index; remap auth FK; start empty. |

## Functions and triggers

Retain this ordinary PostgreSQL trigger function with its authoritative behavior:

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
```

Retain equivalent updated-at triggers for:

- `ai_settings_set_updated_at`;
- `ai_usage_limits_set_updated_at`;
- `performers_set_updated_at`;
- `projects_set_updated_at`;
- `quick_access_items_set_updated_at`;
- `template_libraries_set_updated_at`;
- `user_flags_set_updated_at`.

Do not create `profiles_set_updated_at`, because `profiles` is removed. Do not create Supabase-specific `public.handle_new_user()`. Creation of the 1:1 `public.users` row must be orchestrated by the Kubiki backend through supported Better Auth lifecycle/database hooks or the signup transaction pattern selected and tested in Stage 1; it must not recreate auth logic.

## Better Auth-owned PostgreSQL schema

Better Auth's current core relational models are kept separate from Kubiki application tables:

| Better Auth model | Responsibility | Ownership rule |
|---|---|---|
| `auth.user` | Auth identity: ID, name, email, email-verification status, optional image and timestamps | Better Auth-owned. `public.users.id` references this stable root only. |
| `auth.session` | Session ID/token, expiry, user FK, optional IP/user-agent and timestamps | Better Auth-owned. Business tables never reference it. Used by framework session restore/sign-out/revocation. |
| `auth.account` | Credential/provider account linked to the auth user; password hash for email/password credentials lives here, not in `user` | Better Auth-owned. Business code never reads or references credential columns. |
| `auth.verification` | Expiring verification/reset identifiers and values | Better Auth-owned. Business tables never reference it. |

This is a logical inventory, not hand-written DDL. In Stage 1, pin the Better Auth version/configuration first and generate/review its exact PostgreSQL schema with the Better Auth CLI. Plugin tables are added only if an approved plugin requires them; none are assumed for the beta baseline. A dedicated `auth` schema/search path keeps framework migrations from inspecting or modifying `public` application tables.

Required framework configuration/flows for beta:

- enable email/password signup and sign-in;
- require email verification before a session is created and provide the supported verification-email callback;
- provide the supported reset-email callback and reset route;
- set `revokeSessionsOnPasswordReset: true`;
- use Better Auth session APIs for restore, sign-out and revocation;
- use Better Auth's default password hashing/verification primitives; do not supply custom crypto;
- store core auth/session/verification data in PostgreSQL without adding Redis/secondary storage for the low-ops beta baseline;
- configure an email delivery provider in Stage 1 without putting credentials in source control.

The exact generated constraints/indexes are version/configuration-owned Better Auth artifacts and must be reviewed and committed when Stage 1 is explicitly authorized; they are not guessed in Stage 0.

Official Stage 0 references:

- [Better Auth database and core schema](https://better-auth.com/docs/concepts/database)
- [Better Auth PostgreSQL adapter and non-default schemas](https://better-auth.com/docs/adapters/postgresql)
- [Better Auth email/password, verification and reset flows](https://better-auth.com/docs/authentication/email-password)
- [Better Auth configuration options](https://better-auth.com/docs/reference/options)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)

## Storage mapping

Authoritative current state: private `export-logos` bucket, `file_size_limit = 2097152`, MIME allowlist `image/png`, `image/jpeg`, `image/webp`, 2 objects, total 1,549,914 bytes. Those objects are development/test data and will not be copied or deleted during Stage 0.

Target Timeweb S3 starts empty and private. Preserve equivalent 2 MiB and MIME validation in the server, use server-authorized object keys/signed reads, and do not reproduce `storage.buckets`, `storage.objects`, or Supabase storage policies in PostgreSQL.

## Stage 0 completion boundary

KeyDee, OIDC discovery/JWKS and external CIAM are no longer part of the architecture. Database/storage evidence, retention, target ownership boundaries and required Better Auth flows are resolved for Stage 0.

Stage 1 may begin only on explicit owner instruction. It must pin Better Auth, generate and review the actual auth schema, design the minimal `public.users` DDL, select the supported lifecycle hook/transaction for its creation, and implement/test the Node integration and email delivery. None of that implementation is part of Stage 0.
