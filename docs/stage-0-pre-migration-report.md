# PRE-MIGRATION STAGE 0 report

Date: 2026-08-21. Branch: `feat/ru-infrastructure`.

## Baseline verification

- `npm test`: green, 509 passed / 0 failed.
- `npm run build`: green. Vite reported only existing chunk-size/dynamic-import warnings.
- The failing payment-tag assertion was stale: commit `d553c57` intentionally changed `.kb-tag-payment` from 132 px to 182 px while widening the workspace and tax/payment controls. Product CSS was left unchanged; the test expectation was corrected.
- Isolated commit: `dc89c0c test: align payment tag width expectation`.

## Production Supabase evidence status

**Blocked: production database access is not present on this machine.** Supabase CLI/config/linkage and a database connection string/password are absent. `.env.local` exposes only the frontend Supabase URL and publishable key. An anon-key query cannot authoritatively enumerate schema or rows because grants and RLS deliberately restrict visibility.

Therefore no production changes were made, no secrets were printed, and the following remain unverified: complete schema-only dump, exact `public.projects`, tables/columns/defaults, PK/FK/unique/check constraints, indexes, functions/triggers, extensions, grants, RLS, auth references, storage definitions/policies, migration history, row counts, and storage objects.

The repo contains 13 incremental migrations, but no original `CREATE TABLE public.projects`. Repo migrations are useful reconciliation evidence, not a production dump.

## Owner evidence collection (read-only)

Run from a trusted workstation. Do not paste the password/token into chat, commit it, or put it on a command line. Install current PostgreSQL client tools and Supabase CLI, then discover the installed CLI syntax with `supabase --help`, `supabase db --help`, and `supabase db dump --help`. Set the production connection string in the session's `PGSERVICE`/password file or prompted environment according to local security policy.

Create an ignored directory outside the repository, then run:

```bash
mkdir -p "$HOME/kubiki-stage0-evidence"
chmod 700 "$HOME/kubiki-stage0-evidence"
cd "$HOME/kubiki-stage0-evidence"

# $PROD_DB_URL is supplied securely in this shell only; do not echo it.
pg_dump --dbname="$PROD_DB_URL" --schema-only --schema=public \
  --no-owner --no-privileges --file=production-public-schema.sql
pg_dump --dbname="$PROD_DB_URL" --schema-only --table=public.projects \
  --no-owner --no-privileges --file=production-projects.sql

# A second dump retains grants/ACL evidence; review it for role names before sharing.
pg_dump --dbname="$PROD_DB_URL" --schema-only --schema=public \
  --no-owner --file=production-public-schema-with-acl.sql
```

Use `psql "$PROD_DB_URL" -X --set=ON_ERROR_STOP=1` and spool the following read-only catalog queries to `production-catalog.txt` (use `\pset pager off` and `\o production-catalog.txt` first):

```sql
begin transaction read only;

select current_database(), current_setting('server_version');

select n.nspname as schema_name, c.relname, c.relkind, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m','S')
order by 1,2;

select table_schema, table_name, ordinal_position, column_name, data_type,
       udt_schema, udt_name, is_nullable, column_default, is_identity, is_generated
from information_schema.columns
where table_schema in ('public','storage') order by 1,2,3;

select n.nspname, c.relname, con.conname, con.contype,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') order by 1,2,3;

select schemaname, tablename, indexname, indexdef
from pg_indexes where schemaname in ('public','storage') order by 1,2,3;

select n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid, true)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','storage') order by 1,2,3;

select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) arguments,
       p.prosecdef, pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','storage') order by 1,2,3;

select extname, extversion, n.nspname as schema_name
from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by 1;

select grantee, table_schema, table_name, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema in ('public','storage') order by 2,3,1,4;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','storage') order by 1,2,3;

select conrelid::regclass as source_table, conname,
       confrelid::regclass as referenced_table, pg_get_constraintdef(oid, true)
from pg_constraint where contype='f' and confrelid='auth.users'::regclass order by 1,2;

select version, name from supabase_migrations.schema_migrations order by version;

select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at
from storage.buckets order by id;

select count(*) as object_count,
       coalesce(sum(coalesce((metadata->>'size')::bigint, 0)),0) as total_bytes
from storage.objects where bucket_id='export-logos';

select name as path,
       coalesce((metadata->>'size')::bigint,0) as size_bytes,
       coalesce(metadata->>'mimetype', metadata->>'contentType') as mime_type,
       created_at, updated_at
from storage.objects where bucket_id='export-logos' order by name;

commit;
```

For exact row counts, generate safe quoted statements from the catalog, review them, then execute them in the same read-only transaction:

```sql
select format('select %L as table_name, count(*) as row_count from %I.%I;',
              table_name, table_schema, table_name)
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE'
order by table_name;
```

Also export the linked migration list using the locally installed CLI syntax discovered via `--help` (normally `supabase migration list --linked`). Compare that output to `supabase_migrations.schema_migrations`; do not repair or push migrations during Stage 0.

Before sharing, scan artifacts for connection strings, passwords, JWTs, API keys and unexpected row values. The catalog queries return definitions/metadata and counts, not application row contents.

## Data retention inventory

Actual emptiness and dev/test classification cannot be determined without the counts and owner review of records. Nothing was deleted. Initial disposition based only on table purpose:

| Table | Current evidence | Stage 0 retention disposition |
|---|---|---|
| `projects` | count/content unavailable | Potentially valuable project data; keep by default; explicit decision after owner identifies test projects. |
| `performers` | unavailable | Potentially valuable library data; keep by default. |
| `quick_access_items` | unavailable | Derived user organization data; keep with performers, discard only if explicitly approved. |
| `template_libraries` | unavailable | Potentially valuable template/config data; keep by default. |
| `ai_settings` | unavailable | Potentially valuable config/personalization; keep by default and handle as potentially sensitive text. |
| `studio_export_profiles` | unavailable | Potentially valuable branding/config; keep with referenced logo objects. |
| `export_presets` | unavailable | Potentially valuable config; keep by default. |
| `product_events` | unavailable | Telemetry; candidate to discard or time-bound, but needs explicit analytics/compliance decision. |
| `ai_usage_events` | unavailable | Usage/billing evidence; needs explicit finance/audit retention decision. |
| `user_flags` | unavailable | Low-value UI state; potentially safe to reinitialize, but requires explicit product decision. |
| `ai_usage_limits` | unavailable | Operational entitlement/config; keep or recreate from an owner-approved source; explicit decision required. |
| `beta_feedback` | unavailable | Potentially valuable feedback and possible personal data; explicit product/privacy decision required. |
| Any production-only table | unknown | Must be added after catalog inventory; no default discard. |

Final labels `empty`, `dev/test data`, `safe to discard`, and `keep` must be assigned only after exact counts and a human review of the known non-production accounts/records. “No real users” does not prove rows are disposable.

## Storage inventory

`export-logos` object count, paths, sizes, MIME types and total size are unverified because database/storage administrative access is absent. Repo evidence says the bucket should be private, limited to 2 MiB objects and PNG/JPEG/WebP. The owner queries above inventory metadata without downloading or deleting objects. A zero result must be recorded explicitly as `bucket exists; 0 objects; total 0 bytes`.

## KeyDee sandbox spike

**Blocked before client creation/credentials.** No KeyDee sandbox issuer URL, discovery URL, client ID, registered redirect URI, test account, or recovery mailbox is available. Public search did not locate authoritative product documentation that can be safely tied to this deployment. No production auth integration was written.

Owner actions:

1. Create a sandbox/public PKCE client (not a production client) and register exact local callback and post-logout redirect URIs.
2. Provide through a secret channel: sandbox issuer/discovery URL and client ID; no client secret should be needed for a public PKCE client. Provide disposable test mailbox access separately.
3. Fetch `ISSUER/.well-known/openid-configuration`; record exact `issuer`, `jwks_uri`, authorization/token/end-session endpoints, supported code challenge methods and grant types.
4. Fetch JWKS and record only key metadata (`kid`, `kty`, `use`, `alg`, curve if any), never private material.
5. Complete Authorization Code + PKCE (`S256`) signup and login. Validate token signature against JWKS and validate exact `iss`, `aud`, `exp`, `nbf` if present, and stable `sub`. Record only redacted claim shapes/types; never log or commit tokens.
6. Measure access-token lifetime from `iat/exp`. Determine whether a refresh token/session cookie is issued, whether refresh rotates tokens, whether reuse is rejected, and what logout revokes (browser session, refresh token, access token). Re-test an existing access token after logout without printing it.
7. Exercise signup verification, login failure/success, logout, recovery request and reset completion. Record redirects, expiry/error behavior and whether other sessions are revoked after reset.
8. Delete or disable the disposable sandbox user/client if policy requires it, outside the repository.

Verified token contract fields (`issuer`, JWKS URI, algorithm, audience, `sub`, `exp`, refresh/session behavior) remain **unknown**, not inferred.

## Blockers before Stage 1

- authoritative production evidence bundle and exact `public.projects` DDL;
- row-count-backed retention decisions and identity mapping;
- `export-logos` inventory and S3 copy/verification decision;
- verified KeyDee sandbox token/session contract and all five user flows;
- reconciliation of every production constraint/index/function/trigger/extension/grant/policy with the target plan;
- owner approval of the clean PostgreSQL 16 baseline described in `docs/target-postgres-schema-plan.md`.

Stage 1 was not started. No backend implementation, `pg` dependency, REST CRUD API, repository rewrite, Supabase removal, Timeweb resource, database migration, production mutation, download, or deletion was performed.
