# RiseOS — Anti-Koshary Pass 2 / Structural Cleanup Continuation

Date: 2026-09-10
Source: RiseOS Hardened Pass 3

## What changed

### Tasks
- Extracted task data loading, filtering, mutations, XP deduping, optimistic status transitions, subtask updates, and task creation into `src/hooks/use-tasks-controller.ts`.
- Preserved the `Tasks` component public behavior and existing API endpoints.
- Preserved `data-changed` / instant-update behavior and rollback semantics.
- `tasks.tsx` now keeps presentation/form/calendar state while the controller owns data orchestration.

### Deep Work
- Extracted ambient audio state, fade-in/fade-out lifecycle, volume synchronization, and cleanup into `src/hooks/use-ambient-sounds.ts`.
- Kept the existing sound URLs and labels; exported `AMBIENT_SOUNDS` for the UI.

### Admin
- Extracted admin shared types and formatting helpers to `src/components/rise/admin-panel-utils.ts`.
- `admin-panel.tsx` retains the same tab/component structure and imports the shared helpers/types.

## Verification

- TypeScript/TSX parser: PASS — 230 files, 0 parse diagnostics.
- Relative import resolution sweep: PASS — 0 missing relative imports.
- Rise API mutation sweep: PASS — 30 mutation route files, 0 missing idempotency wrapper.
- Browser Supabase SDK sweep: PASS — 0 matches under `src/components` / `src/app`.
- Direct arbitrary SQL sweep: PASS — only allowlisted `admin_read` RPC remains in admin query route.
- Audited user-data components: no direct localStorage usage remains; Sidebar localStorage is UI-only navigation state.

## Database

No new SQL is required for this pass. Keep the existing migration sequence through `022` according to the deployment state already applied to Supabase.

## Runtime validation limitation

A clean dependency install did not finish in this environment, and the resulting `node_modules` is incomplete/invalid. Therefore no claim is made that `next build`, ESLint, full TypeScript typecheck, Prisma validation, npm audit, or live E2E tests passed here.

## Remaining structural work

The largest remaining UI files are still intentionally not rewritten wholesale. The next safest candidates are to split admin tabs into files and extract Deep Work timer/session orchestration into a controller, followed by Finance/Learning/Morning Routine if repeated responsibilities are confirmed.
