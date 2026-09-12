# RiseOS — Security Hardening Session 3

## Completed

### 1) Server-owned BFF authentication
- Browser login/signup now use `/api/auth/login` and `/api/auth/signup` only.
- Supabase browser client was removed from the application flow.
- Access/refresh tokens are not returned in login/signup/refresh JSON responses.
- `/api/auth/sync-token` is deprecated and returns HTTP 410; browser code no longer calls it.
- `/api/auth/session` accepts the `rise-access` httpOnly cookie for browser sessions.
- `withAuth` now binds the complete request context so cookie-authenticated requests use their per-request token in the data layer.

### 2) Admin SQL hardening
- `/api/rise/admin/query` no longer accepts arbitrary `sql`.
- It accepts only a fixed `queryId` allowlist and bounded `limit`.
- Database reads execute through `public.admin_read(...)`.
- Migration 015 revokes normal-role access to any legacy `public.exec_sql(...)` function that may already exist.

### 3) Admin self-provisioning fix
- Self-service signup can never grant the admin role.
- UI-facing `isAdmin` during signup is false.
- Admin provisioning must be performed out-of-band by the operator.

### 4) Fail-closed read behavior
- Multiple user-facing API read handlers were changed from fake-success empty payloads to HTTP 500 errors.
- Dashboard recent/weekly data no longer silently replaces DB failures with empty arrays.

### 5) XP cleanup
- Removed unreachable legacy XP code after the atomic production/local implementations.

## Manual Supabase SQL required

Run these migrations in order after the existing schema migrations:

1. `supabase/migrations/013_security_hardening.sql`
2. `supabase/migrations/014_request_idempotency.sql`
3. `supabase/migrations/015_admin_read_allowlist.sql`

### Data-changing notes
- 013 hashes/backfills API keys and removes the plaintext key column. Take a backup before running it.
- 014 may remove older duplicate `budget-config` / `savings-goal` records before creating the unique index; it keeps the newest row. Take a backup and review those rows first.
- 015 creates `admin_read` and revokes normal access to legacy `exec_sql`.

## Verification
- TS/TSX parser: PASS — 196 files.
- Session 3 security checks: PASS — 10/10.
- No browser imports of `@/lib/supabase-client`.
- No auth JSON responses exposing session tokens in `/api/auth/*`.
- No arbitrary SQL payload accepted by admin query route.
- `admin_read` is the only SQL execution path referenced by the application.

## Not yet claimed as fully passed
A clean production dependency install, ESLint, full TypeScript typecheck, Prisma validation, Next production build, and E2E/browser security tests still need to be run in an environment with the project dependencies installed.

## Next hardening priorities
1. Move the offline mutation queue from `localStorage` to IndexedDB with stronger device/user binding and safer recovery semantics.
2. Convert remaining multi-write route flows to DB transactions/RPCs where atomicity matters.
3. Add a dedicated authorization matrix test suite covering every `/api/rise/**` route.
4. Run a clean dependency/security/build/E2E verification pass.
