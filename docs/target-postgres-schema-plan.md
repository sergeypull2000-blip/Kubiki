# Stage 0: Supabase → PostgreSQL 16 schema plan

Status: production database and storage evidence is sufficient for the clean greenfield target. This is a plan, not a migration; no SQL has been applied. The only remaining Stage 0 blocker is live KeyDee sandbox verification.

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
- New `public.users`, keyed/mapped from the verified stable KeyDee subject. Its exact identifier representation and token-related contract cannot be finalized until the sandbox verifies `sub`, issuer, audience and lifecycle behavior.
- Every application `user_id → auth.users(id)` FK becomes `user_id → public.users(id)`, preserving verified nullability and `ON DELETE CASCADE` behavior.
- Supabase `auth.uid()`/Data API RLS is replaced by server-side authentication and owner-scoped authorization. Runtime queries must constrain ownership; database roles use least privilege. Defense-in-depth target RLS remains a Stage 1 implementation decision, not a substitute for server checks.
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
| `public.profiles` | Removed. Do not migrate rows. Its auth mirroring responsibility moves to internal `public.users` created from verified KeyDee identity. |
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

Do not create `profiles_set_updated_at`, because `profiles` is removed. Do not create Supabase-specific `public.handle_new_user()`; its `SECURITY DEFINER` auth trigger/profile insertion model is replaced by server-controlled KeyDee user provisioning.

## Storage mapping

Authoritative current state: private `export-logos` bucket, `file_size_limit = 2097152`, MIME allowlist `image/png`, `image/jpeg`, `image/webp`, 2 objects, total 1,549,914 bytes. Those objects are development/test data and will not be copied or deleted during Stage 0.

Target Timeweb S3 starts empty and private. Preserve equivalent 2 MiB and MIME validation in the server, use server-authorized object keys/signed reads, and do not reproduce `storage.buckets`, `storage.objects`, or Supabase storage policies in PostgreSQL.

## Remaining gate before Stage 1

The database/storage evidence and retention decision are resolved. Before a migration or production integration may be created, verify in a real KeyDee sandbox:

1. issuer and discovery/JWKS URI;
2. signing algorithm and key selection;
3. exact audience rules;
4. stable `sub` representation used by `public.users`;
5. `exp`/access-token lifetime;
6. refresh/session rotation and revocation behavior;
7. Authorization Code + PKCE signup, login, logout, recovery and reset flows.

No token-contract field may be inferred.
