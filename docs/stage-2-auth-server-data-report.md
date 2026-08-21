# Stage 2: authentication and server data report

## Scope and files changed

Stage 2 adds the standalone Node authentication/request boundary and PostgreSQL repositories without changing the browser authentication or browser repositories. The implementation changes the Stage 1 application baseline, `server/auth.js`, `server/app.js`, `server/index.js`, the server-only API data helpers, usage endpoint/gate, and focused tests. New modules live in `server/email.js`, `server/requestAuth.js`, and `server/repositories/`.

## Better Auth server configuration

The server remains pinned to `better-auth` 1.7.1. It uses the generated `auth.user`, `auth.session`, `auth.account`, and `auth.verification` schema through the dedicated PostgreSQL pool whose search path is `auth`. Email/password, required email verification, sessions, password reset, and `revokeSessionsOnPasswordReset: true` are configured. `server/email.js` is the provider-neutral delivery boundary for verification and reset links. It deliberately fails when no delivery implementation is configured; no mail vendor was selected in Stage 2.

Better Auth is mounted at `/api/auth/*` only on the standalone backend. The legacy Vercel/frontend runtime is unchanged.

## Internal user resolution and request context

`public.users` now has an independent UUID primary key and a required unique `auth_user_id` foreign key to `auth.user.id`. Resolution uses one parameterized `INSERT ... ON CONFLICT (auth_user_id) DO UPDATE ... RETURNING`, so repeated and concurrent first requests return the same internal identity and the database enforces the one-to-one mapping.

For every standalone application API request, the server validates the Better Auth session from request headers, resolves the internal user, and creates a trusted context containing `authUser`, `session`, and `user.id`. API handlers receive this context and the PostgreSQL repository object internally. Caller-provided `user_id` values are never used for ownership. Missing, invalid, or expired sessions return a generic 401.

## PostgreSQL repositories and replaced server reads

The new explicit repositories provide:

- internal-user resolution;
- AI settings reads;
- owner-scoped project lookup and project ID diagnostics;
- owner-scoped performer, template-library, and project-history reads;
- usage limits, monthly totals, reservations, event persistence, and reservation release.

Every owned SQL query binds the trusted internal user UUID as `$1`; project lookup additionally binds the client project ID as `$2`. The existing API helper functions choose these repositories in the standalone backend and retain their Supabase/PostgREST compatibility branch for legacy Vercel.

## Quota concurrency strategy

`public.ai_usage_reservations` has a primary key on `(user_id, month_start)`. A short transaction removes an expired lease, reads the effective limit and current monthly spend, then atomically inserts one lease with `ON CONFLICT DO NOTHING`. Therefore only one metered provider call for a user/month can pass quota admission at a time. No database transaction or connection is held while waiting for DeepSeek. Event insertion and lease deletion are committed together; failed provider paths release the lease, and a bounded expiry recovers crashed processes. Unlimited users do not need a lease. Pricing and the existing rule of checking already-accounted spend before a call are unchanged.

## What remains on Supabase

All normal frontend authentication, session handling, and browser CRUD repositories remain on Supabase, including `src/App.jsx`, `src/AuthScreen.jsx`, and `src/repositories/`. The legacy Vercel API authentication and PostgREST branches also remain as rollback compatibility. They are selected only when the request does not carry the standalone backend's trusted context. Supabase/Vercel files and resources were not removed or mutated.

## Verification

- `npm test`: passed, 528/528.
- `npm run build`: passed. Vite reports the existing dynamic-import and chunk-size warnings.
- `npm run db:check-auth-schema`: passed for Better Auth 1.7.1. The generator emits its expected warning because its isolated schema-inspection stub does not create a live `auth` schema.
- `npm run lint`: completed with existing frontend warnings and no errors.

Focused tests cover 401 behavior, trusted-context spoof resistance, authenticated internal-user resolution, repeated/concurrent atomic resolution, owner-bound project/settings/history SQL, concurrent quota admission, unlimited mode, usage persistence, and reservation SQL invariants. Existing AI and browser/Supabase tests remain green.

## Deferred live PostgreSQL checks and Stage 3 blockers

No live PostgreSQL instance was created or mutated in Stage 2. On Timeweb staging, apply both migrations to PostgreSQL 16 and verify Better Auth signup/session/verification/reset against a configured email delivery implementation, the `auth` search path, concurrent `public.users` resolution, reservation contention/expiry, and query plans for owner-scoped reads. SMTP or another approved mail transport must be selected and supplied through the email boundary before beta email flows can deliver messages.

Stage 3 must not begin until the Timeweb PostgreSQL environment and secrets are provisioned, migrations are applied and checked, and the deferred integration checks above pass. S3, browser CRUD migration, frontend Better Auth switching, old-user/data migration, and infrastructure provisioning are outside this stage.
