# Supabase — Final Manual SQL

## Existing installations

If `001` through `018` are already applied, execute this file/migration only:

`supabase/migrations/019_final_privilege_hardening.sql`

It contains **no data deletion**. It tightens RPC privileges, disables direct execution of internal helper functions, disables legacy `exec_sql` access for normal roles, and adds the atomic admin broadcast RPC.

## Fresh installations

Run migrations in repository order.

## Session 5 dependency

The final chain expects the previously supplied migrations through `018_integrity_and_atomic_goal_toggle.sql` to exist.

## What changes in the database

- RPC EXECUTE permissions are reduced to the minimum intended roles.
- `admin_read` is service-mediated.
- Internal ownership/trigger helper functions are not directly callable by ordinary users.
- Legacy `exec_sql(text/jsonb)` is revoked from `PUBLIC`, `anon`, and `authenticated` when present.
- Adds `admin_broadcast_notifications_atomic(...)` for all-or-nothing admin broadcast insertion.

## Data-changing migrations from earlier sessions

Before relying on a fresh production run, make sure these earlier migrations have been reviewed/applied in order:

- `013_security_hardening.sql` — key hashing, audit ledger.
- `014_request_idempotency.sql` — request idempotency and singleton cleanup.
- `016_atomic_composite_mutations.sql` — composite transaction RPCs.
- `018_integrity_and_atomic_goal_toggle.sql` — achievement de-duplication and ownership integrity.

`014` and `018` can modify existing duplicate data, so take a backup before first application.
