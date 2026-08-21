# PRE-MIGRATION STAGE 0 report

Date: 2026-08-21. Branch: `feat/ru-infrastructure`.

## Baseline verification

- `npm test`: green, 509 passed / 0 failed.
- `npm run build`: green; only existing chunk-size/dynamic-import warnings.
- The payment-tag assertion was stale: commit `d553c57` intentionally changed `.kb-tag-payment` from 132 px to 182 px. Product CSS was unchanged and the test expectation was corrected.
- Isolated fix commit: `dc89c0c test: align payment tag width expectation`.

## Production database evidence

Production evidence collected by the owner through Supabase SQL Editor is sufficient for the clean greenfield target.

Authoritative public table list:

`ai_settings`, `ai_usage_events`, `ai_usage_limits`, `beta_feedback`, `export_presets`, `performers`, `product_events`, `profiles`, `projects`, `quick_access_items`, `studio_export_profiles`, `template_libraries`, `user_flags`.

Exact `public.projects`:

- `id uuid NOT NULL DEFAULT gen_random_uuid()`, PK;
- `user_id uuid NOT NULL`, FK to `auth.users(id) ON DELETE CASCADE`;
- `name text NOT NULL DEFAULT 'Без названия'`;
- `data_version integer NOT NULL DEFAULT 1`;
- `project_data jsonb NOT NULL DEFAULT '{}'::jsonb`;
- `created_at timestamptz NOT NULL DEFAULT now()`;
- `updated_at timestamptz NOT NULL DEFAULT now()`;
- `client_id text NOT NULL`;
- unique `(user_id, client_id)`;
- indexes `projects_pkey`, `projects_updated_at_idx(updated_at DESC)`, `projects_user_id_client_id_key(user_id, client_id)`, `projects_user_id_idx(user_id)`;
- `projects_set_updated_at` trigger.

Authoritative `public.profiles`:

- `id uuid`, PK and FK to `auth.users(id) ON DELETE CASCADE`;
- nullable `email text` and `display_name text`;
- `created_at timestamptz DEFAULT now()` and `updated_at timestamptz DEFAULT now()`.

Owner decision: do not reproduce `profiles`; replace the Supabase auth/profile model with Better Auth's user identity plus a thin internal `public.users` ownership root.

The composite FK `quick_access_items(user_id, performer_client_id) → performers(user_id, client_id) ON DELETE CASCADE` is explicitly preserved.

`public.set_updated_at()` is ordinary PostgreSQL and is retained with the supplied authoritative body. Equivalent triggers are retained for `ai_settings`, `ai_usage_limits`, `performers`, `projects`, `quick_access_items`, `template_libraries`, and `user_flags`. Supabase-specific `SECURITY DEFINER public.handle_new_user()` and `profiles_set_updated_at` are not part of the target.

All other supplied ordinary PostgreSQL constraints and indexes are preserved. Every appropriate `auth.users` FK becomes a `public.users` FK. `auth.uid()` RLS/Data API authorization becomes server-side authorization.

## Final data-retention decision

There are no real production users. All current Supabase application rows, Auth users, profile rows and Storage objects are personal owner development/test data.

Nothing is deleted now. The old Supabase/Vercel environment remains unchanged throughout the rollback/reference window.

Do not migrate:

- any application row from any current table;
- Supabase Auth users;
- `public.profiles` rows;
- `export-logos` objects;
- any old-user identity mapping.

Target production starts with these empty stores:

- `public.users`;
- `projects`;
- `performers`;
- `quick_access_items`;
- `template_libraries`;
- `ai_settings`;
- `studio_export_profiles`;
- `export_presets`;
- `product_events`;
- `ai_usage_events`;
- `ai_usage_limits`;
- `beta_feedback`;
- `user_flags`;
- Timeweb S3.

This resolves every Stage 0 data keep/discard decision: legacy data is retained only in the unchanged rollback environment and is not copied to the new production environment.

## Storage evidence

Authoritative current `export-logos` state:

- bucket exists and is private;
- file size limit: 2,097,152 bytes;
- allowed MIME types: `image/png`, `image/jpeg`, `image/webp`;
- current objects: 2;
- current total: 1,549,914 bytes.

Owner decision: do not download, migrate or delete these objects. Target Timeweb S3 starts empty.

## Target PostgreSQL 16 baseline

The exact table/constraint/index mapping is recorded in `docs/target-postgres-schema-plan.md`. The clean baseline preserves current application data structures and ordinary PostgreSQL behavior while applying these architectural substitutions:

- `auth.users` FK → `public.users` FK;
- Supabase Auth/KeyDee → Better Auth in the Kubiki Node backend;
- `public.profiles`/`handle_new_user()` → Better Auth `auth.user` plus thin 1:1 `public.users` application identity;
- `auth.uid()`/Supabase RLS → server-side owner authorization;
- Supabase Storage → private empty Timeweb S3;
- old Supabase migration history/data → no import into the clean baseline.

No migration has been created.

## Better Auth decision and schema boundary

KeyDee is removed from the target architecture. No OIDC sandbox, external CIAM or token-contract verification is required. Supabase Auth users remain disposable and are not migrated.

Target auth is Better Auth in the Kubiki Node backend, using the same Timeweb Managed PostgreSQL 16 database as application data. Better Auth owns a dedicated `auth` schema with its core `user`, `session`, `account`, and `verification` models. Their exact DDL must be generated from the pinned Better Auth version/configuration in Stage 1, not authored from memory.

Kubiki business ownership is deliberately separated:

- `auth.user` is the stable authentication identity;
- `public.users.id` is a UUID PK and 1:1 FK to `auth.user(id) ON DELETE CASCADE`;
- all application `user_id` FKs point to `public.users(id)`;
- application tables never reference or inspect `auth.session`, `auth.account`, password hashes, or `auth.verification`;
- the Node backend derives the owner ID only from a successfully restored Better Auth session and performs owner-scoped authorization.

Required beta flows use Better Auth framework capabilities: email/password signup, sign in, sign out, session restore, required email verification, forgot/reset password, and session revocation on reset via `revokeSessionsOnPasswordReset: true`. Password hashing, verification tokens, reset tokens, sessions and cookies are framework responsibilities; Kubiki must not implement custom authentication primitives.

For the low-ops beta, core auth/session/verification data remains in PostgreSQL with no Redis/secondary store requirement. Transactional email delivery is a Stage 1 dependency. The Better Auth version, generated auth schema, supported `public.users` provisioning hook/transaction and email provider must be pinned/reviewed only after Stage 1 is explicitly authorized.

## Stage boundary

Production DB/storage evidence, retention, authentication framework, auth/application schema boundary and required beta flows are resolved. Stage 0 has no remaining architecture-discovery blocker.

Stage 1 has not started. No backend implementation, `pg` dependency, REST CRUD API, repository rewrite, Supabase removal, Timeweb resource, database migration, production mutation, data copy, download or deletion was performed.
