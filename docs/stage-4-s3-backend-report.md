# Stage 4: provider-neutral S3 backend for export logos

## Scope

Stage 4 replaces the standalone backend's remaining export-logo storage boundary with standard private S3-compatible operations. It does not provision Timeweb resources, change the browser repository, remove Supabase browser storage code, alter `/api/extract-doc`, or implement project-file uploads. The frontend therefore remains on Supabase until Stage 6.

## Dependencies and configuration

The backend uses exact versions of `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (`3.1116.0`). There is no Timeweb-proprietary storage code.

Required backend-only environment variables are `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. `S3_FORCE_PATH_STYLE` defaults to `false`; `S3_SIGNED_URL_TTL_SECONDS` defaults to 300 seconds and is capped at 900 seconds. Credentials are passed only to the server-side S3 client and are never included in API DTOs. `PutObject` does not set a public ACL; the deployment bucket must be created and retained as private outside this stage.

## Routes

- `POST /api/export-profile/logo` authenticates through the existing Better Auth/internal-user boundary, accepts a multipart `file`, enforces an exact 2 MiB file limit, accepts PNG/JPEG/WebP only, verifies both declared MIME and magic bytes, generates `users/<internal-user-id>/export-logos/<uuid>.<ext>`, uploads privately, and atomically switches the owner-scoped database reference. It returns `{ "path": "..." }`.
- `GET /api/export-profile/logo-url?path=...` authenticates, validates the server key shape and authenticated user prefix, then requires an exact match with that owner's current `logo_asset_path` before returning `{ "signedUrl": "..." }`. Foreign, stale, malformed, and spoofed paths return the same `404 not_found` response.
- `DELETE /api/export-profile/logo` authenticates, locks and clears only the authenticated owner's current database reference, then attempts to delete that exact object. It returns `{ "ok": true }`.

The general `PUT /api/export-profile` route no longer writes `logo_asset_path`, preventing presentation-setting payloads from bypassing the authoritative storage routes. The old browser repository remains unchanged and is not yet wired to these DTOs.

## Storage consistency strategy

Upload replacement follows `put new object -> lock owner profile and switch DB reference -> best-effort delete old object`. A failed S3 put never reaches the database. A failed DB switch leaves the previous working reference untouched and triggers best-effort deletion of the newly uploaded object. The old object is never deleted before the new object and database state are established.

Delete follows `lock owner profile and clear DB reference -> best-effort delete old object`. This ordering prefers a harmless unreferenced object over a database reference to a missing object. Database mutations use the authenticated internal user ID in their predicates and row locks serialize competing changes to a profile.

There is an unavoidable orphan risk when best-effort cleanup fails after a successful DB switch/clear, or when the process exits between S3 upload and cleanup. Production operations should periodically list the `users/*/export-logos/*` namespace and remove objects that are older than a safety window and absent from `studio_export_profiles.logo_asset_path`. This cleanup job is deliberately not implemented in Stage 4.

## Test coverage

`test/stage4S3Logo.test.js` covers unauthenticated responses, valid authoritative uploads, invalid MIME and signature, files over 2 MiB, foreign/stale/spoofed paths, owner-scoped signing and deletion, failed S3 uploads, failed DB replacement cleanup, preservation of an existing logo, replacement ordering, correct owner SQL, and blocking general profile writes from changing the logo path. Configuration tests cover required backend-only S3 values and the signed-URL TTL cap. Responses are asserted to contain only their public DTO fields; no storage credentials are returned.

## Verification

- `npm test`: passed, 545/545 tests.
- `npm run build`: passed; existing dynamic-import and bundle-size warnings remain.
- `npm run db:check-auth-schema`: passed; the expected isolated-generation warning about the absent live `auth` schema remains.
- `npm run lint`: passed with 20 pre-existing frontend warnings and no errors.
- `git diff --check`: passed; Git reported only working-copy LF-to-CRLF notices.

No commit or push was performed.
