# RiseOS Security Hardening — Session 1

## Status
This session fixes the highest-risk cross-layer issues identified in the audit. The working tree was modified directly from the supplied `rise-os-main.zip`.

## Fixed in this session

### 1. MCP authentication isolation — P0
The MCP server no longer stores `authToken`/`authMethod` as module-global mutable state. Authentication is now held in an `MCPAuthState` owned by each `createRiseOsServer()` instance. HTTP sessions therefore receive independent auth state instead of sharing one user's token with another session.

JWT sessions in MCP also retain a refresh token inside that session context and can refresh once on a 401 before declaring the session expired.

### 2. Offline queue cross-user isolation — P0/P1
The old global `rise-offline-queue` was replaced by user-scoped keys:

`rise-offline-queue:<userId>`

Every queued mutation now carries `userId`. The queue refuses to replay an item under a different user, and logout clears the current user's pending queue. The legacy global queue is intentionally discarded instead of replayed because its owner cannot be proven safely.

### 3. Offline mutation semantics — P1
Offline writes no longer pretend to have committed. Queued writes return HTTP `202` with `accepted`, `queued`, and `requestId` metadata.

The same request ID is reused as `Idempotency-Key` during retries.

The client never silently discards the oldest queue item when the queue is full.

### 4. Offline queue auth-expiry behavior — P1
A queued mutation that gets `401` attempts a controlled token refresh. If the session still cannot be refreshed, the mutation stays queued rather than being deleted as a permanent 4xx failure.

### 5. API key secret handling — P0/P1
API key generation now stores only a SHA-256 hash (`key_hash`) in Supabase. The plaintext key is returned only at creation time and is no longer read back from the database.

The local/mock Prisma path was also aligned: its legacy `UserApiKey.key` field now stores the SHA-256 digest rather than the plaintext secret, while old local plaintext records are migrated in-place to the digest on first successful lookup.

A new migration `013_security_hardening.sql`:
- backfills hashes from the legacy plaintext `key` column,
- enforces unique hashed keys,
- removes the plaintext `key` column,
- enforces RLS on the key table.

### 6. Durable audit ledger — P1
Admin audit events were moved from the user-facing `notifications` table to a dedicated `audit_logs` table.

The new ledger is append-oriented, RLS-protected, and indexed for actor/target/time queries. Admin audit UI endpoints now read the ledger.

### 7. Suspension authorization — P1
Suspension checks are now fail-closed. If the suspension lookup cannot be verified, authorization is denied rather than allowing the account through.

`/api/auth/login` and `/api/auth/session` also stop silently treating profile/suspension verification failures as a normal active account.

The special admin-email shortcut that bypassed suspension checks was removed from `/api/auth/session`.

### 8. Cookie-first / browser token hardening — P1
Production Supabase client session persistence is now disabled:

`persistSession: false`

The browser no longer persists Supabase access/refresh tokens in `rise-auth` during normal production login/refresh flows. Non-secret user display metadata may remain in `rise-user-info`.

The central `apiFetch` also refuses to use legacy `rise-auth` JWTs when public Supabase configuration is present.

Push-notification requests were migrated to the central API client so they use the httpOnly cookie instead of reading a JWT from local storage.

### 9. CSRF protection — P1/P2
State-changing `/api/*` requests now validate the `Origin` header against the current origin and optional `ALLOWED_ORIGINS` values.

Requests without an Origin remain compatible with non-browser/API clients and are still subject to normal endpoint authentication.

### 10. Privileged admin SQL hardening — P1
The admin SQL route still requires admin authorization and single-statement SELECT semantics, but now additionally blocks known dangerous functions/comments and caps `LIMIT` to 500 rows.

This is hardening, not a complete removal of the privileged-SQL capability; replacing it with an allowlisted RPC/query set remains the preferred production design.

### 11. Abuse/rate-limit hardening — P2
Dedicated limits were added for:
- `/api/error-log`
- `/api/rise/export`
- `/api/rise/delete-all`
- `/api/rise/mcp/key`
- `/api/rise/mcp/call`
- `/api/rise/notifications/send`
- `/api/rise/admin/query`

### 12. Admin route consistency — P1/P2
The admin storage endpoint was standardized to use `requireAdmin()` and now writes an audit event.

### 13. Security regression tests
Added `tests/security-hardening.spec.ts` with source-level invariants for:
- MCP auth isolation
- user-scoped offline queue
- API-key hashing
- fail-closed suspension
- CSRF protection
- browser token persistence behavior
- admin SQL hardening

## Verification performed

- Parsed the repository's 195 `.ts`/`.tsx` source files with the installed TypeScript parser: all files passed syntax parsing.
- Checked every `src/app/api/rise/admin/**/route.ts`: all admin routes contain `requireAdmin`.
- Static security invariants passed for MCP global auth removal, queue scoping, API key plaintext removal, fail-closed suspension, CSRF middleware, cookie-only production persistence, and audit ledger presence.

## Not claimed as fully fixed yet

### A. Server-side idempotency for every mutation — next priority
The client now sends stable `Idempotency-Key` values and the offline queue reuses them, but the server does not yet persist/replay an idempotency result for every mutation route.

This is the next major reliability/security layer for:
- tasks
- goals
- finance
- journal
- habits
- notifications
- XP
- other write endpoints

### B. IndexedDB / encrypted offline storage
The queue is user-scoped now, but it is still stored in browser `localStorage`. That is safer than the old cross-user queue, but IndexedDB with encryption-at-rest is the stronger design for health/journal/finance data.

### C. Fully removing client-side Supabase access-token exposure in memory
Browser persistent storage has been hardened, but while a Supabase session is active, the Supabase JS client can still hold the current access token in memory. A complete BFF/session-cookie architecture would move browser authentication fully to server-issued cookies and avoid client-side Supabase session ownership.

Also, `/api/auth/login` still returns session token material because the MCP login flow consumes it; the browser itself no longer persists that material. A future split between browser/BFF login and MCP authentication would tighten this boundary further.

### D. Admin SQL should ideally be replaced by a whitelist of approved queries/RPCs
The current hardening reduces abuse, but arbitrary privileged SQL remains a powerful capability by design.

### E. Migration history cleanup
The repository contains duplicate historical migration numbering around `008`. Renaming already-deployed migrations can break Supabase migration history, so this was intentionally not rewritten blindly. It should be cleaned up with a migration-history-aware procedure in a later session.

### F. Full dependency/build audit
A full `npm ci` could not be completed in the sandbox environment, so I did not falsely claim that a clean production build or dependency vulnerability scan succeeded. Syntax/static validation did succeed.

## Current session result

**Fixed now:** the high-risk cross-layer paths are hardened across MCP, browser auth, API keys (including local/mock mode), offline queue, suspension checks, CSRF/rate limits, admin authorization, audit storage, and privileged SQL guardrails.

**Still open for the next session:** durable server-side idempotency, transaction/ownership hardening, encrypted IndexedDB offline storage, full BFF cookie-only auth split, replacing arbitrary admin SQL with allowlisted operations, migration-history cleanup, and a clean dependency/typecheck/build/E2E/security run in a complete dependency environment.

## Required database action
Run:

`supabase/migrations/013_security_hardening.sql`

after migrations `001` through `012` are present in the target database.

After running it, verify:

- `user_api_keys.key` no longer exists.
- `user_api_keys.key_hash` is populated and NOT NULL.
- `audit_logs` exists.
- `audit_logs` has RLS enabled.
- only the intended service role can insert/read audit rows.

## Recommended order for the next session

1. Database-backed idempotency/replay layer for all critical mutations.
2. Transactional multi-step writes and ownership constraints.
3. IndexedDB-based offline store + safer dead-letter/conflict handling.
4. Final browser auth/BFF cleanup.
5. Full clean install, lint, typecheck, build, E2E and security scan.
