# RiseOS Security Hardening — Session 2

## Scope
This session continues from the hardened Session 1 tree and focuses on server-side replay/idempotency, atomic critical mutations, RLS-first access, and cross-layer consistency.

## Applied fixes

### 1. Server-side idempotency / replay protection
- Added `src/lib/idempotency.ts`.
- State-changing `/api/rise/**` requests require `Idempotency-Key` in `src/middleware.ts`.
- Mutation routes are wrapped with `withIdempotency(...)`.
- The request body, method, path and query are fingerprinted.
- Same key + same request replays the stored response; same key + different request gets `409`.
- Stale processing leases can be reclaimed.
- Idempotency storage is fail-closed in production.
- Secret-bearing API-key creation opts out of response-body persistence; a replay gets `409` rather than exposing/recreating a secret.

### 2. Atomic XP awarding
- `earn-xp` now calls `award_xp_atomic` in Supabase production mode.
- The RPC locks the profile, inserts the dedupe record, calculates XP/level/streak, and updates the profile inside one PostgreSQL transaction.
- Local SQLite mode uses one Prisma transaction and a unique `XpAward` record.
- Added `last_active_date` to Supabase `profiles` to match the local data model.

### 3. Atomic full data deletion
- `delete-all` now re-authenticates on an isolated non-persistent Supabase client.
- The actual wipe is performed by `delete_user_data_atomic` inside one PostgreSQL transaction.
- Dependent task subtasks and goal milestones are removed through existing FK cascades.
- API keys, XP dedupe records, idempotency records, notifications, work sessions, and other user data are covered.
- Usage/storage counters are reset atomically instead of silently ignoring table failures.

### 4. RLS-first user data access
Normal user routes no longer use `service_role` for their own data:
- storage
- export
- dashboard
- dashboard/summary
- productivity-score
- budgets
- MCP API-key management
- profile name/avatar
- push subscription / notification send
- seed bulk inserts

`service_role` remains only where it is intentionally required: authenticated admin operations and API-key resolution/server-side privileged infrastructure.

### 5. Data-layer improvements
- Added `data.profiles`, `data.userSettings`, `data.userStorage`, `data.userAIUsage`, `data.userApiKeys`, and `data.habitLogs` accessors as needed.
- `dailyScores.list(..., [])` now correctly means "all dates" instead of an empty `.in()` filter.
- Budget/savings singleton writes now have a DB-level partial unique index.

### 6. Ownership hardening
`014_request_idempotency.sql` also adds triggers ensuring:
- a task's `project_id` belongs to the same user;
- a task's `depends_on` task belongs to the same user;
- milestones always point at an existing goal.

## Files the user must run manually in Supabase

### `supabase/migrations/013_security_hardening.sql`
Run after migrations 001–012.

This migration contains the Session 1 changes: API-key hashing/cleanup and the `audit_logs` table/RLS.

### `supabase/migrations/014_request_idempotency.sql`
Run after 013.

This migration contains the Session 2 DB changes:
- `request_idempotency`
- ownership validation triggers
- cleanup + unique index for `budget-config` / `savings-goal`
- `profiles.last_active_date`
- `award_xp_atomic(...)`
- `delete_user_data_atomic(...)`

**Important:** the migration intentionally removes duplicate `budget-config` / `savings-goal` rows, keeping the newest row before adding the unique index. Back up/review that data before executing it.

## Local Prisma changes
- `prisma/schema.prisma` now includes `RequestIdempotency` and `XpAward`.
- Added migration: `prisma/migrations/20260907200000_request_idempotency_xp/migration.sql`.

## Validation performed
- TypeScript/TSX parser: PASS — 193 files, 0 syntax errors.
- Mutation coverage audit: all declared `/api/rise` POST/PUT/PATCH/DELETE handlers are wrapped, except the intentionally deprecated `/api/rise/mcp/call` endpoint.
- Non-admin `getSupabaseAdmin` audit: NONE.
- Direct privileged table access in non-admin routes: NONE (the seed's `habit_logs` batch insert uses the authenticated RLS client).
- Full `tsc`, ESLint, Prisma CLI validation and production build were not claimed as passed because the available dependency installation in this workspace is incomplete/timeout-prone.

## Still remaining for the next hardening pass
1. Replace the remaining powerful admin SQL endpoint with allowlisted RPCs/query definitions rather than arbitrary SQL.
2. Finish transaction/RPC hardening for multi-write task/goal/seed flows where a single request still performs several independent DB mutations.
3. Move the browser offline queue from localStorage to an encrypted/user-bound IndexedDB design.
4. Complete the cookie-only BFF split so the login endpoint itself never returns access/refresh tokens to browser JavaScript in production.
5. Clean up the historical duplicate Supabase migration number `008` without breaking an already-applied migration history.
6. Run a clean dependency install, Prisma validation, ESLint, production build, Playwright E2E, and security scanners against a real test Supabase project.
