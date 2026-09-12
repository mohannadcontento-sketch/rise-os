# RiseOS — Security Hardening Session 4

## Scope
This session continued from Hardened Session 3 and focused on offline persistence, cross-account isolation in browser storage, composite database writes, and idempotency concurrency safety.

## Implemented

### 1. Encrypted IndexedDB offline storage
- Added `src/lib/secure-offline-db.ts`.
- Offline mutation queue is no longer stored in plaintext localStorage.
- Queue payloads use AES-GCM encryption with a non-extractable browser CryptoKey stored in IndexedDB.
- Each queue/cache record is keyed by the authenticated user's `userId`.
- Legacy global `rise-offline-queue` is never migrated or replayed.
- If IndexedDB persistence fails, a new offline mutation is not reported as durably queued.

### 2. Encrypted user-scoped React Query persistence
- Replaced the global `riseos-query-cache` localStorage persister.
- React Query persistence now uses the same encrypted, user-scoped IndexedDB storage.
- Logout clears the in-memory QueryClient; old query cache remains isolated to its user and can never be restored into another user's store.

### 3. Cross-account local UI isolation
Added `src/lib/user-storage.ts` and migrated personal browser state such as:
- weekly/monthly reviews
- work/deep-work timer state
- planner/quick notes
- AI coach local history/contributions
- user settings/name/avatar
- dashboard quote state
- sync failure state

These keys are namespaced as `rise-user:<userId>:...`.
Legacy unscoped user data is deliberately not migrated because ownership cannot be proven safely.

### 4. Composite task writes are atomic
- Added `create_task_with_subtasks()` and `update_task_with_subtasks()` in Supabase migration 016.
- Supabase path uses these RPCs for task create/update.
- Local SQLite/Prisma path uses `$transaction()` for the same operations.
- This closes the partial-write window around task + subtasks.

### 5. Idempotency lease race fixed
- Added `processingToken` / `processing_token`.
- Stale idempotency records are reclaimed only when `processing_until < now` in the same update operation.
- Two workers cannot both successfully reclaim the same stale request.
- Completion is bound to the exact processing token so a reclaimed worker cannot complete another worker's lease.

### 6. Admin RPC compatibility hardened
- Migration 017 replaces the admin allowlist RPC with a version that accepts the already-authenticated admin user ID when invoked through the server's trusted `service_role` client.
- The old 2-argument RPC is revoked.
- Raw SQL remains unavailable to application users.

### 7. Authentication/event integration
- Successful authentication now emits `rise:user-authenticated` so encrypted user-bound persistence can start immediately.
- Logout no longer destroys pending encrypted offline mutations. They remain bound to their original user and can only be flushed after that same user authenticates again.
- The delete-all flow clears the user's encrypted local query/cache/UI state after successful server-side deletion.

## Verification

### Static parser
- 194 TypeScript/TSX files parsed successfully.
- Parse errors: 0.

### Mutation coverage
- 52 state-changing handlers under `src/app/api/rise`.
- 51 use `withIdempotency`.
- The only non-wrapped POST is the deprecated `mcp/call` endpoint that intentionally returns 503.
- Admin and normal-user mutation routes are included.

### Browser security checks
- No browser component imports the Supabase browser client.
- No production login code persists `rise-auth`.
- Personal UI localStorage keys are no longer unscoped.
- Offline mutation payloads are not persisted in plaintext localStorage.

### Full build limitation
A clean dependency install could not be completed in the execution environment (the `npm ci` process timed out, and the provided node_modules tree is incomplete). Therefore a full `tsc`, ESLint, Prisma validation, Next production build, and Playwright runtime suite are NOT marked as passed.

## Remaining high-priority work
1. Move remaining non-secret UI state from `localStorage` to encrypted IndexedDB where stronger at-rest privacy is required.
2. Convert remaining multi-write domain mutations (notably seed/import-style operations and any composite notification/task workflows) to explicit database transactions/RPCs.
3. Run a clean dependency install and complete full build/lint/typecheck/Prisma/E2E/security tooling.
4. Verify all Supabase migrations 013–017 on a staging project before production.
