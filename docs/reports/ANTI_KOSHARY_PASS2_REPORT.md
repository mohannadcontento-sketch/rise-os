# RiseOS — Anti-Koshary Pass 2 / Structural Cleanup Report

## Scope
Applied to the Hardened Final tree after the approved Pass-1 findings.

## Completed
- Unified authenticated Rise API request setup in `src/lib/api-auth.ts`; all 30 non-admin Rise API routes now use `requireUser(req)`. No direct `requireAuth(req)` / `setCurrentAuthToken(req)` remains under `src/app/api/rise/**` outside admin routes.
- Removed user-owned preference/state writes from unscoped `localStorage` in reminder engine, daily planner, AI coach, notification preferences, and sound settings. They now use `src/lib/user-storage.ts`.
- Replaced notification N+1 update/delete loops with batch data-layer methods: `updateMany`, `removeMany`, `removeAll`.
- Updated the local Mock Supabase client so `delete().select()` returns deleted rows, matching production behavior used for accurate batch counts.
- Fixed the broadcast RPC schema mismatch: the notification column is `read`, and the allowed notification type is `system`; the historical `019_final_privilege_hardening.sql` is corrected in the source tree and `020_broadcast_schema_fix.sql` is provided for already-applied deployments.
- Split the former monolithic `src/lib/data.ts` into 22 domain modules under `src/lib/data/`, while keeping `data.<domain>` as the stable public facade. `data.ts` is now a 51-line composition layer.
- Added `021_notification_integrity.sql` with an index for the user/read/created access pattern.
- Added `022_admin_read_contract_fix.sql` to correct the `recent_errors` result metadata and keep the admin RPC contract exact.
- Added `tests/anti-koshary-pass2.spec.ts` with static invariants for the above fixes.

## Validation
- 214 TypeScript/TSX files parsed successfully with the installed TypeScript parser.
- 0 parse errors.
- 30/30 non-admin Rise API routes use the shared auth wrapper.
- 0 direct auth/context calls remain in those routes.
- 0 raw localStorage calls remain in the five user-owned preference/data modules audited in Pass 2.
- Notification batch methods: 3/3 present.
- No browser Supabase SDK imports found under `src/components` or `src/app`.

## Not claimed as passed
A clean dependency installation, `tsc --noEmit`, ESLint, Prisma validation, production build, runtime E2E, and live Supabase RLS probes were not completed in this environment because project dependencies are not installed and the repository package does not contain `.git` history.

## Remaining decisions / follow-up
The remaining structural High findings are primarily large UI/controller modules (`dashboard.tsx`, `tasks.tsx`, `admin-panel.tsx`) whose behavior should be extracted incrementally rather than rewritten blindly. The project also contains both `package-lock.json` and `bun.lock`; choose one package manager and keep the other lockfile only if it is intentionally supported.
