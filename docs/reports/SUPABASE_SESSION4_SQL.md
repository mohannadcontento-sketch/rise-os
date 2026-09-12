# Supabase SQL — Session 4

## Apply order

Run these in order on the Supabase SQL Editor after your existing migrations:

1. `supabase/migrations/013_security_hardening.sql`
2. `supabase/migrations/014_request_idempotency.sql`
3. `supabase/migrations/015_admin_read_allowlist.sql` — only if this migration has NOT already been applied from Session 3.
4. `supabase/migrations/016_atomic_composite_mutations.sql`
5. `supabase/migrations/017_idempotency_lease_and_admin_fix.sql`

## Important

If you already applied Session 3's original `015_admin_read_allowlist.sql`, do NOT execute the edited source file again as a new migration. Execute `016` and `017`; migration 017 contains the corrected `admin_read` function definition and revokes the old signature.

`013` and `014` can modify existing database state. In particular, `014` cleans duplicate `budget-config` / `savings-goal` rows before adding uniqueness. Back up production data before applying them.

## Files

### 013
`supabase/migrations/013_security_hardening.sql`

Adds API-key hashing, `audit_logs`, RLS, and related security hardening.

### 014
`supabase/migrations/014_request_idempotency.sql`

Adds `request_idempotency`, atomic XP awarding, atomic user-data deletion, singleton indexes, and ownership triggers.

### 015
`supabase/migrations/015_admin_read_allowlist.sql`

Replaces arbitrary admin SQL execution with a fixed allowlist. Use the already-applied version if you have it.

### 016
`supabase/migrations/016_atomic_composite_mutations.sql`

Adds atomic task/subtask and goal/milestone composite operations.

### 017
`supabase/migrations/017_idempotency_lease_and_admin_fix.sql`

Adds `request_idempotency.processing_token`, fixes stale lease concurrency, and fixes the admin allowlist RPC for the server-side service-role invocation.

## After applying SQL, verify

```sql
-- Idempotency table
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'request_idempotency'
order by ordinal_position;

-- Lease column should exist and be NOT NULL
select count(*) as missing_processing_tokens
from public.request_idempotency
where processing_token is null or processing_token = '';

-- Admin function signatures
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_read', 'create_task_with_subtasks', 'update_task_with_subtasks');

-- Dangerous legacy function should have no normal-role execute privilege
select has_function_privilege('anon', 'public.exec_sql(text)', 'EXECUTE') as anon_exec_sql,
       has_function_privilege('authenticated', 'public.exec_sql(text)', 'EXECUTE') as auth_exec_sql;
```

Expected security outcome:
- `processing_token` exists and contains a value for all rows.
- `admin_read(text, integer, uuid)` exists.
- `exec_sql` is not executable by `anon` or `authenticated` when the old function exists.
- `create_task_with_subtasks` and `update_task_with_subtasks` exist.
