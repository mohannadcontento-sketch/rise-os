# Supabase — Session 5 SQL

Run after the previously completed hardening migrations.

Required migration sequence:

- `013_security_hardening.sql`
- `014_request_idempotency.sql`
- `015_admin_read_allowlist.sql`
- `016_atomic_composite_mutations.sql`
- `017_idempotency_lease_and_admin_fix.sql`
- `018_integrity_and_atomic_goal_toggle.sql`

If 013–017 are already applied in Supabase, apply **only 018**.

File:

`supabase/migrations/018_integrity_and_atomic_goal_toggle.sql`

It adds:
- atomic milestone toggle + goal progress update
- focus-session/task ownership trigger
- unique achievement key + duplicate cleanup
- atomic admin deletion
- corrected self-service delete RPC
- service-role-only execution for `admin_read`

Production warning: make a database backup first because duplicate achievements may be deleted.
