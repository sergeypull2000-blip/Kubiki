# Stage 3: owner-scoped REST API

## Scope and repository audit

Stage 3 adds the authenticated PostgreSQL REST boundary only. The browser still uses the existing Supabase repositories and Supabase Auth. No UI, S3, Timeweb resource, legacy Vercel handler, or Supabase migration was changed.

The current browser repository contracts were audited directly. Projects and performers return normalized domain arrays/items. Quick Access returns `{ items }` for list/batch and preserves `pinned`, `order`, and performer references. Template Library and AI Settings return `{ exists, library/settings }`; export profile returns `{ exists, profile }`. Presets return `{ id, name, settings, createdAt, updatedAt }`, ordered by newest `updated_at`; duplicate remains composition over create. Product events and feedback are insert-only. User flags expose the singleton read and the beta-welcome mutation.

## Routes implemented

- `GET|POST /api/projects`, `PUT|DELETE /api/projects/:clientId`, `POST /api/projects/batch`
- `GET|POST /api/performers`, `PUT|DELETE /api/performers/:clientId`, `POST /api/performers/batch`
- `GET|POST /api/quick-access-items`, `PUT|DELETE /api/quick-access-items/:clientId`, `POST /api/quick-access-items/batch`, `DELETE /api/quick-access-items/by-performer/:performerClientId`
- `GET|PUT|DELETE /api/template-library`
- `GET|PUT /api/ai-settings`
- `GET|PUT /api/export-profile` (database fields only)
- `GET|POST /api/export-presets`, `PUT|DELETE /api/export-presets/:id`
- `POST /api/product-events`
- `GET /api/user-flags`, `PUT /api/user-flags/beta-welcome-seen`
- `POST /api/beta-feedback`

No read endpoints were added for product events, beta feedback, usage internals, Better Auth tables, or users. No arbitrary flags, SQL, or table API exists.

## Implementation and ownership

`server/ownerApiRoutes.js` performs route matching, validation, and serialization. `server/repositories/ownerApiRepository.js` contains explicit parameterized PostgreSQL operations and reuses the existing project, performer, Quick Access, Template Library, AI Settings, and export-setting normalizers.

Every application route first resolves a verified Better Auth session to `public.users.id` through the existing request authenticator. Only that internal ID is passed to repositories. Reads, updates, and deletes include it in their predicates; inserts bind it server-side. Client ownership fields are rejected, including inside batch items. Foreign and missing identifiers both produce `404 not_found`. The Quick Access insert is conditional on a performer with the same trusted owner, and the composite database FK remains defense in depth.

## Validation and errors

The lightweight boundary accepts only route-specific fields. It validates bounded IDs/UUIDs, strings, booleans, JSON objects, event types, request size, and batches (maximum 100). Personalization is limited to 8,000 characters and still passes through the shared sanitizer. Telemetry metadata is limited to 16 KB; preset JSON to 100 KB; template-library JSON to 500 KB. Ownership fields are never persisted.

Errors are stable JSON `{ "error": "code" }`: 400 invalid input/malformed JSON, 401 missing authentication, 404 absent or not owned, 409 unique conflict, and 500 internal error. PostgreSQL details, connection information, stack traces, and Better Auth internals are not returned.

## Batch behavior and tests

Project, performer, and Quick Access batches use one checked-out PostgreSQL client, `BEGIN`, sequential ordered upserts, and `COMMIT`; any failure triggers `ROLLBACK`. This preserves input/result order and prevents partial application. Empty batches are valid and the maximum is 100.

`test/stage3OwnerApi.test.js` covers unauthenticated access across every API family, trusted internal ownership, spoof rejection, owner-bound update/delete SQL, foreign-performer rejection, singleton/insert identity propagation, transaction rollback, path/event/batch validation, and malformed JSON. Existing Stage 2 authentication and repository tests continue to cover Better Auth-to-internal-user resolution and owner-scoped server data access. Live PostgreSQL integration is intentionally deferred; focused tests exercise the HTTP boundary plus mocked `pg` transaction/query boundary.

## Deliberate deferrals and Stage 4 requirements

The export-profile DB fields are available, including `logo_asset_path` and `logo_position`, but logo upload, delete, and signed URL methods remain Supabase Storage-only. Stage 4 must temporarily retain those storage-specific methods, or the storage stage must precede the final export-profile switch. No fake S3 behavior was added.

All browser repositories, `src/supabaseClient.js`, `@supabase/supabase-js`, Supabase Auth/Storage, and legacy Vercel endpoints remain. Stage 4 must add HTTP repository implementations and Better Auth browser session integration without changing these DTO contracts. Staging must verify the migration against managed PostgreSQL 16, including transaction rollback, composite-FK rejection, cascade deletion, JSON/constraint conflicts, and Better Auth cookies under the production origin.

## Verification

- Focused Stage 3 tests: passed (6/6).
- `npm test`: passed (534/534).
- `npm run build`: passed.
- `npm run db:check-auth-schema`: passed.
- `npm run lint`: passed with 20 pre-existing frontend warnings and no errors.
