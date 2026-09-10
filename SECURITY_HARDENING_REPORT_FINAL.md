# RiseOS — Final Security & Integrity Audit

## Scope

This audit starts from the hardened Session 5 tree and verifies the full application boundary:

`Browser/UI → API routes → authentication/BFF → request context → data layer → Supabase/RLS/RPC → Prisma/SQLite → MCP`

The review also checks all API route files, persistence helpers, migration chain, local storage, secrets exposure, and cross-user ownership constraints.

## Final fixes in this pass

1. **Server auth client isolation**
   - Login, signup, refresh, and resend now use a fresh `createSupabaseIsolatedClient()`.
   - The cached server anon client is explicitly `persistSession:false, autoRefreshToken:false`.
   - This prevents a shared in-memory Supabase auth state from crossing concurrent requests.

2. **BFF cleanup**
   - Refresh tokens are accepted only from the `rise-refresh` httpOnly cookie.
   - `/api/auth/sync-token` remains permanently disabled (`410`), so browser JavaScript cannot inject tokens into the BFF.
   - Removed the readable `rise-user` cookie; UI metadata is non-authoritative JSON response/local UI state.
   - Admin privilege is based on the stored profile role, not merely on matching an environment email.

3. **Admin read correctness**
   - Fixed historical `admin_read` projections that referenced non-existent `audit_logs.user_id` and `error_logs.level` columns.
   - `recent_audit` now aliases `actor_user_id` correctly.
   - `recent_errors` uses the actual `error_logs` columns.
   - The final migration removes direct `authenticated` execution from the admin read RPC.

4. **Atomic administration**
   - Admin broadcast now uses one DB-side transaction/RPC instead of chunked partial writes.
   - A failed broadcast cannot be reported as a successful partial broadcast.
   - Admin user deletion remains one atomic database operation.

5. **SQLite ownership defense-in-depth**
   - Focus-session → task ownership is enforced with a SQLite trigger in addition to the application ownership checks.
   - The Prisma schema remains intentionally simple; the trigger is the actual local DB guard.

6. **Diagnostics isolation**
   - Sync failure diagnostics are user-scoped via the existing user storage helper and no longer use a global localStorage key.

7. **Error semantics**
   - Seed failures no longer return a fake success response.
   - Admin error-log clearing returns `503` when its backing database is unavailable instead of reporting success.

8. **Final cross-file sweep**
   - Re-scanned all 323 tracked working-tree files (excluding build/dependency directories) and all API route handlers after the final fixes.
   - 38 mutation route handlers are present; all normal `/api/rise` mutations are idempotency-protected. Compatibility/deprecated endpoints are intentionally excluded.
   - No browser Supabase SDK usage, browser `rise-auth` persistence, or module-global MCP auth token remains.

## Verified invariants

- 201 TypeScript/TSX files successfully transpile for syntax validation with TypeScript 5.x compiler API.
- Browser source contains no direct Supabase client import.
- Browser source contains no `localStorage.setItem('rise-auth', ...)`.
- All non-deprecated `/api/rise` mutation handlers are protected by authentication + idempotency.
- Admin mutations are protected by `requireAdmin` + idempotency.
- No arbitrary SQL route remains in the application.
- No application `exec_sql` call remains.
- Production auth cookies are httpOnly + Secure + SameSite=Lax.
- Login/signup/refresh/resend use isolated auth clients.
- User API keys are stored hashed and returned only once.
- Offline queue data is encrypted in IndexedDB and user-bound.
- Supabase RLS is enabled across the application data model, with child-table ownership checks and additional DB triggers for cross-table references.
- Atomic XP, composite task/goal operations, milestone toggles, deletion, and admin broadcast are implemented as transaction boundaries.

## Database migrations

For a database that already has migrations 001–018 applied, the new manual migration is:

`supabase/migrations/019_final_privilege_hardening.sql`

For a fresh deployment, run the migrations in repository order.

The migration `008` numbering duplication is intentionally not renamed here: changing a migration filename after it has been applied can desynchronize Supabase migration history. The repository should treat both historical `008` files as an existing migration-history condition and avoid destructive renaming.

Local SQLite/Prisma migration:

`prisma/migrations/20260908033000_focus_task_ownership/migration.sql`

It adds the focus-task ownership trigger and lookup index.

## Important deployment validation

A full dependency-backed `tsc`, ESLint, Prisma validation, Next.js production build, and browser E2E run could not be re-run in this isolated audit environment because the package cache is empty and `npm ci` timed out. The source-level syntax and security invariants pass, but that is not a substitute for a clean dependency install in CI.

## Remaining operational hardening

These are not currently identified as cross-user data-loss/security defects, but should be kept on the engineering roadmap:

- Add distributed Upstash rate limiting in production if multiple server instances are used.
- Run automated migration/RLS permission probes against a disposable Supabase project in CI.
- Add CI execution of the real browser E2E and production smoke/security scripts.
- Rotate any credentials that may have existed in older deployments before the hardening work if there is any possibility they were exposed.
