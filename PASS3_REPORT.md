# RiseOS — Anti-Koshary Pass 2 / Structural Cleanup Follow-up

Base: `rise-os-main-hardened-pass2`

## Changes

1. Extracted Dashboard data orchestration into `src/hooks/use-dashboard-data.ts`.
   - Fetching, refresh coalescing, day rollover refresh, optimistic KPI reconciliation, and overdue task movement now live outside the presentation component.
   - The existing `data.*` facade and UI behavior remain unchanged.
   - Dashboard keeps presentation-only concerns plus a small UI wrapper for toast/sound feedback.

2. Re-verified user-scoped browser persistence.
   - AI Coach, Daily Planner, Reminder Engine, Weekly Review, and Monthly Review all use `getUserStorage`/`setUserStorage` for user-owned persisted state.
   - No direct `localStorage` use remains in those modules.
   - Fixed/global-looking key constants are intentionally namespaced at runtime by `user-storage.ts`.

3. Re-verified API auth abstraction.
   - No direct `requireAuth(req)` or `setCurrentAuthToken(...)` remains in normal `/api/rise` user routes.
   - Routes use the shared auth wrapper, while admin/deprecated endpoints remain explicit.

4. Re-verified Data Layer split.
   - `src/lib/data.ts` remains a stable facade over 22 domain modules.
   - No domain repository was merged back into the facade.

## Validation

- TypeScript/TSX parse sweep: PASS (227 files, 0 parse errors).
- Direct `localStorage` in audited user-owned components: PASS (0 direct calls).
- Unscoped user-owned storage keys: PASS (runtime wrapper namespaces them).
- Direct legacy auth setup in normal `/api/rise` routes: PASS (0 findings).
- Raw admin SQL execution / `exec_sql` references in `/api/rise` routes: PASS (0 findings).

## Runtime validation limitation

A clean `npm ci --ignore-scripts` was attempted, but the execution environment timed out before dependency installation completed. Therefore `npm run lint`, full `tsc`, `prisma validate`, production build, and live E2E tests are not claimed as passed here.

## No new Supabase SQL required for this pass

This follow-up is a structural/client-side refactor only. Continue to apply the already-issued migrations in order, including 020–022, according to `SUPABASE_PASS2_SQL.md` and the prior final SQL instructions.
