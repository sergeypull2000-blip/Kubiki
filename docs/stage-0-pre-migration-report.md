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

Owner decision: do not reproduce `profiles`; replace the Supabase auth/profile model with internal `public.users` based on verified KeyDee subject.

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
- `public.profiles`/`handle_new_user()` → server-controlled KeyDee user provisioning;
- `auth.uid()`/Supabase RLS → server-side owner authorization;
- Supabase Storage → private empty Timeweb S3;
- old Supabase migration history/data → no import into the clean baseline.

No migration has been created.

## Only remaining Stage 0 blocker: KeyDee sandbox

No KeyDee sandbox issuer URL, client registration, client ID, registered redirect URI, disposable test account or recovery mailbox is available. Therefore the following remain unknown and are not inferred: issuer, JWKS URI, signing algorithm, audience, stable `sub`, `exp`, and refresh/session behavior. No production auth integration was written.

Minimal owner steps:

1. In the KeyDee sandbox/admin console, create one **public browser/SPA OIDC application** using Authorization Code flow with PKCE; do not create or share a client secret for the browser client.
2. Register exact sandbox callback and post-logout redirect URIs for a local test harness, plus the allowed local web origin if KeyDee requires it.
3. Enable signup, email verification, logout, password recovery/reset and refresh/offline session capabilities required for the test.
4. Create or provide a disposable sandbox mailbox/test user and ensure the owner can receive verification and recovery messages.
5. Share through a secure channel only the sandbox issuer/discovery URL and public client ID, together with the exact registered redirect URIs. Do not send tokens, passwords or secrets in chat or commit them.
6. Keep the sandbox client isolated from production users and production redirect URIs.

With those inputs, complete and record:

- discovery `issuer` and `jwks_uri`;
- JWKS public key metadata and the actual token signing algorithm;
- validated `iss`, `aud`, stable `sub`, `exp` and optional time claims without logging token values;
- signup and verification;
- login through Authorization Code + PKCE (`S256`);
- logout and observed access/refresh/session revocation;
- recovery request and password reset completion;
- refresh issuance, rotation, reuse and expiry behavior.

## Stage boundary

Production DB/storage evidence and retention are resolved. Actual KeyDee sandbox verification is the sole remaining Stage 0 blocker.

Stage 1 has not started. No backend implementation, `pg` dependency, REST CRUD API, repository rewrite, Supabase removal, Timeweb resource, database migration, production mutation, data copy, download or deletion was performed.
