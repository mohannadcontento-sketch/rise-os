# RiseOS — Security Hardening Session 5

## Scope
Session 5 closes database-level integrity and atomicity gaps found after Sessions 1–4.

## Implemented

1. **Atomic goal milestone toggle**
   - Added `toggle_goal_milestone_atomic()` in migration 018.
   - Milestone ownership, toggle, goal progress calculation, and goal status update execute in one DB transaction.
   - Removed the old route flow that wrote the milestone, reloaded all goals, then wrote the parent goal.
   - Local Prisma performs the equivalent work inside `$transaction()`.

2. **Focus-session cross-user reference protection**
   - Added `trg_validate_focus_task_ownership`.
   - A focus session cannot point to a task owned by another user.
   - The shared data layer also validates task ownership before writes.

3. **Achievement integrity**
   - Added unique `(user_id, badge_id)` in PostgreSQL and `(userId, badgeId)` in Prisma.
   - Migration 018 removes duplicate achievement rows first, preserving the newest `earned_at` record.
   - Achievement writes use an upsert against the natural key.

4. **Atomic admin user-data deletion**
   - Added `admin_delete_user_data_atomic(admin, target)`.
   - Admin deletion no longer loops through tables from the API layer.
   - Child tables without `user_id` (`habit_logs`, `subtasks`, `milestones`) are handled through their parent relations.
   - The self-service `delete_user_data_atomic()` from migration 014 was corrected for the same child-table issue.
   - Auth account deletion remains a separate, deliberate operation.

5. **Admin RPC least privilege**
   - Direct EXECUTE on `admin_read()` was removed from ordinary `authenticated` clients.
   - The server's trusted `service_role` path is the only application execution path.

## Verification

- TypeScript/TSX parser: **200 files / 0 parse errors**.
- No unscoped `rise-*` localStorage writes found by static sweep.
- No Supabase browser-client imports in `src/components` or `src/app`.
- No direct `getSupabaseAdmin()` calls in normal-user `/api/rise` routes.
- Every non-deprecated state-changing `/api/rise` handler remains protected by idempotency.
- Session 5 static integrity tests cover atomic goal toggle, atomic admin deletion, focus ownership, and achievement uniqueness.

## Database action required

Apply:

`supabase/migrations/018_integrity_and_atomic_goal_toggle.sql`

after migrations 013–017.

For local Prisma, apply:

`prisma/migrations/20260908030000_integrity_constraints/migration.sql`

## Warning

Migration 018 may remove duplicate `user_achievements` rows, keeping the newest `earned_at` row per `(user_id, badge_id)`. Back up production before applying it.

A clean dependency install and full runtime build/lint/typecheck/E2E suite still need to be executed in a normal development/CI environment; the audit environment could not complete `npm ci` reliably.
